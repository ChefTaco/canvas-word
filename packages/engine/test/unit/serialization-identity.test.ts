// Review anchors address text as {paragraphId, runId, start, end}. These cases check that
// paragraph and run identities survive load (expansion to glyphs) and serialization.
import { describe, expect, it } from 'vitest';
import { ElementType } from '../../src/editor/dataset/enum/Element';
import type { IElement } from '../../src/editor/interface/Element';
import { formatElementList, zipElementList } from '../../src/editor/utils/element';
import { mergeOption } from '../../src/editor/utils/option';

interface Identity {
  kind: 'paragraph' | 'run';
  paragraphId: string;
  runId?: string;
}
interface Paragraph {
  id: string;
  runs: Array<{ id: string; text: string; bold?: boolean }>;
}

const paragraphs: Paragraph[] = [
  {
    id: 'para-1',
    runs: [
      { id: 'run-1a', text: 'The bridge ' },
      { id: 'run-1b', text: 'creaked', bold: true },
      { id: 'run-1c', text: ' under the cart 😀 é.' },
    ],
  },
  { id: 'para-2', runs: [{ id: 'run-2a', text: 'A second paragraph.' }] },
  { id: 'para-3', runs: [{ id: 'run-3a', text: 'Last one​with a literal zero-width space.' }] },
];

function toElements(source: Paragraph[]): IElement[] {
  return source.flatMap((paragraph): IElement[] => [
    ...paragraph.runs.map(
      (run): IElement => ({
        type: ElementType.TEXT,
        id: run.id,
        value: run.text,
        externalId: run.id,
        ...(run.bold ? { bold: true } : {}),
        extension: { kind: 'run', paragraphId: paragraph.id, runId: run.id } satisfies Identity,
      }),
    ),
    {
      type: ElementType.TEXT,
      id: `${paragraph.id}-mark`,
      value: '\n',
      externalId: `${paragraph.id}-mark`,
      extension: { kind: 'paragraph', paragraphId: paragraph.id } satisfies Identity,
    },
  ]);
}

const options = mergeOption();
const load = (elements: IElement[]) => {
  const copy = structuredClone(elements);
  formatElementList(copy, { editorOptions: options });
  return copy;
};
const save = (elements: IElement[]) => zipElementList(elements, { extraPickAttrs: ['id'] });

/** Paragraph/run text spans, the shape review anchors are resolved against. */
function spans(elements: IElement[]) {
  const result: Array<{ paragraphId: string; runId: string; id: string; text: string }> = [];
  for (const element of elements) {
    const identity = element.extension as Identity | undefined;
    if (identity?.kind !== 'run') continue;
    result.push({
      paragraphId: identity.paragraphId,
      runId: identity.runId!,
      id: element.id!,
      text: element.value,
    });
  }
  return result;
}

describe('serialized paragraph and run identity', () => {
  it('keeps run IDs, external IDs and paragraph membership across load and save', () => {
    const saved = save(load(toElements(paragraphs)));
    expect(spans(saved)).toEqual(
      paragraphs.flatMap((paragraph) =>
        paragraph.runs.map((run) => ({
          paragraphId: paragraph.id,
          runId: run.id,
          id: run.id,
          text: run.text,
        })),
      ),
    );
    for (const element of saved) {
      const identity = element.extension as Identity;
      if (identity.kind === 'run') expect(element.externalId).toBe(identity.runId);
    }
  });

  it('is a fixed point: repeated serialize -> load cycles return identical data', () => {
    const first = save(load(toElements(paragraphs)));
    let current = first;
    for (let cycle = 0; cycle < 3; cycle++) current = save(load(current));
    expect(current).toEqual(first);
  });

  it('keeps paragraph marks as separate, identified elements', () => {
    const saved = save(load(toElements(paragraphs)));
    const marks = saved.filter((element) => (element.extension as Identity).kind === 'paragraph');
    expect(marks.map((element) => (element.extension as Identity).paragraphId)).toEqual([
      'para-1',
      'para-2',
      'para-3',
    ]);
    expect(marks.every((element) => element.value === '\n')).toBe(true);
    expect(marks.map((element) => element.id)).toEqual(['para-1-mark', 'para-2-mark', 'para-3-mark']);
  });

  it('resolves the same anchor offsets after a round trip', () => {
    const anchor = { paragraphId: 'para-1', start: 4, end: 18 };
    const quote = (elements: IElement[]) =>
      spans(elements)
        .filter((span) => span.paragraphId === anchor.paragraphId)
        .map((span) => span.text)
        .join('')
        .slice(anchor.start, anchor.end);
    const original = toElements(paragraphs);
    const reloaded = save(load(save(load(original))));
    expect(quote(reloaded)).toBe('bridge creaked');
    expect(quote(reloaded)).toBe(quote(original));
  });

  it('assigns fresh, persistent IDs to unidentified glyphs before they are saved', () => {
    const loaded = load([{ value: 'Untracked text' }]);
    const ids = loaded.map((element) => element.id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(save(loaded).map((element) => element.id)).toEqual(save(load(save(loaded))).map((element) => element.id));
  });

  it('strips IDs unless the caller asks for them', () => {
    const saved = zipElementList(load(toElements(paragraphs)));
    expect(saved.some((element) => Object.hasOwn(element, 'id'))).toBe(false);
    expect(spans(saved).map((span) => span.runId)).toEqual(['run-1a', 'run-1b', 'run-1c', 'run-2a', 'run-3a']);
  });
});
