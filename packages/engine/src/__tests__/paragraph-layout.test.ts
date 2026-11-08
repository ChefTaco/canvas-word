import { describe, expect, it } from 'vitest';
import {
  paragraphRowHeight,
  keptParagraphHeight,
  paragraphBreakBefore,
} from '../editor/utils/paragraphLayout';
import type { IRow } from '../editor/interface/Row';
const row = (height: number, options: Partial<IRow> = {}): IRow => ({
  height,
  width: 100,
  ascent: 12,
  startIndex: 0,
  rowIndex: 0,
  elementList: [],
  ...options,
});
describe('generic paragraph row layout', () => {
  it('keeps before/after spacing outside painted row height', () => {
    const measured = row(28, { offsetY: 12, spacingAfter: 18 });
    expect(paragraphRowHeight(measured)).toBe(58);
    expect(measured.height).toBe(28);
  });
  it('keeps an entire short paragraph and the next line when the group fits', () => {
    const rows = [
      row(20, { paragraphStart: true, paragraphLayout: { id: 'heading', keepWithNext: true } }),
      row(20, { paragraphLayout: { id: 'heading' }, spacingAfter: 8 }),
      row(20, { paragraphStart: true, paragraphLayout: { id: 'body' }, offsetY: 4 }),
      row(20, { paragraphLayout: { id: 'body' } }),
    ];
    expect(keptParagraphHeight(rows, 0)).toBe(72);
    expect(paragraphBreakBefore(rows, 0, 100, 160, 20, true)).toBe(true);
    expect(paragraphBreakBefore(rows, 0, 20, 160, 20, false)).toBe(false);
    expect(paragraphBreakBefore(rows, 0, 20, 60, 20, true)).toBe(false);
  });
  it('starts a paragraph on a new page without inventing an empty initial page', () => {
    const rows = [row(20, { paragraphStart: true, paragraphLayout: { pageBreakBefore: true } })];
    expect(paragraphBreakBefore(rows, 0, 20, 160, 20, false)).toBe(false);
    expect(paragraphBreakBefore(rows, 0, 50, 160, 20, true)).toBe(true);
  });
});
