import { describe, expect, it } from 'vitest';
import { zipElementList } from '../editor/utils/element';
import { ElementType } from '../editor/dataset/enum/Element';
import { TraceType } from '../editor/dataset/enum/Trace';
import type { IElement } from '../editor/interface/Element';
import { ZERO } from '../editor/dataset/constant/Common';

describe('serialization of externally identified text fragments', () => {
  it('retains paragraph sentinels independently of identically bound text glyphs', () => {
    const serialized = zipElementList([
      { value: 'A', externalId: 'run', extension: { block: 'same' } },
      { value: ZERO, externalId: 'run', extension: { block: 'same' } },
      { value: 'B', externalId: 'run', extension: { block: 'same' } },
    ]);
    expect(serialized.map((item) => item.value)).toEqual(['A', '\n', 'B']);
  });
  it('retains literal U+200B as text rather than paragraph syntax', () => {
    const input = ['A', '\u200b', 'B'].map((value, index) => ({
      type: ElementType.TEXT,
      id: `glyph-${index}`,
      value,
      externalId: 'run',
      extension: { block: 'same' },
    }));
    expect(
      zipElementList(input)
        .map((element) => element.value)
        .join(''),
    ).toBe('A\u200bB');
    expect(input.map((element) => element.value)).toEqual(['A', '\u200b', 'B']);
  });
  it('coalesces glyphs in the same external run without mutating source identity metadata', () => {
    const extension = { application: { block: 'paragraph-one', style: { custom: 'retained' } } };
    const input: IElement[] = [
      { type: ElementType.TEXT, value: 'A', id: 'glyph-a', externalId: 'run-one', extension },
      { type: ElementType.TEXT, value: '😀', id: 'glyph-b', externalId: 'run-one', extension },
    ];
    const serialized = zipElementList(input, { extraPickAttrs: ['id'] });
    expect(serialized).toHaveLength(1);
    expect(serialized[0]).toMatchObject({
      id: 'glyph-a',
      value: 'A😀',
      externalId: 'run-one',
      extension,
    });
    expect(input.map((element) => element.value)).toEqual(['A', '😀']);
    (serialized[0]!.extension as typeof extension).application.style.custom = 'changed snapshot';
    expect(extension.application.style.custom).toBe('retained');
  });
  it('isolates nested table cells and formatting metadata while compacting glyphs', () => {
    const extension = { application: { style: { font: 'owned' } } };
    const cell = {
      id: 'cell',
      colspan: 1,
      rowspan: 1,
      value: [
        { value: 'A', id: 'a', externalId: 'cell-run', extension },
        { value: 'B', id: 'b', externalId: 'cell-run', extension },
      ],
    };
    const input: IElement[] = [
      {
        type: ElementType.TABLE,
        id: 'table',
        value: '',
        trList: [{ id: 'row', height: 20, tdList: [cell] }],
      },
    ];
    const before = structuredClone(input);
    const serialized = zipElementList(input, { extraPickAttrs: ['id'] });
    expect(input).toEqual(before);
    expect(input[0]!.trList![0]!.tdList[0]).toBe(cell);
    expect(serialized[0]!.trList![0]!.tdList[0]!.value).toHaveLength(1);
    (
      serialized[0]!.trList![0]!.tdList[0]!.value[0]!.extension as typeof extension
    ).application.style.font = 'snapshot edit';
    expect(extension.application.style.font).toBe('owned');
    expect(input).toEqual(before);
  });
  it('keeps distinct run IDs, styles, review traces and extension identities separate', () => {
    const first: IElement = {
      type: ElementType.TEXT,
      value: 'A',
      id: 'glyph-a',
      externalId: 'run-one',
      extension: { block: 'one' },
      trace: [{ type: TraceType.INSERTED, author: 'Author A', timestamp: 1 }],
    };
    for (const difference of [
      { externalId: 'run-two' },
      { bold: true },
      { extension: { block: 'two' } },
      { trace: [{ type: TraceType.DELETED, author: 'Author B', timestamp: 2 }] },
    ]) {
      expect(
        zipElementList([first, { ...first, id: 'glyph-b', value: 'B', ...difference }]),
      ).toHaveLength(2);
    }
    expect(
      zipElementList(
        [
          { value: 'A', id: 'explicit-a' },
          { value: 'B', id: 'explicit-b' },
        ],
        { extraPickAttrs: ['id'] },
      ),
    ).toHaveLength(2);
  });
});
