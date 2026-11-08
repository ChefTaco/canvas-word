import { describe, expect, it } from 'vitest';
import { formattingToggleElements } from '../editor/utils/formattingSelection';
import { ZERO } from '../editor/dataset/constant/Common';
describe('visible formatting toggle state', () => {
  it('ignores boundary insertion defaults while keeping Unicode text and literal zero width spaces', () => {
    const visible = [
      { value: '😀', bold: true },
      { value: '\u200b', bold: true },
    ];
    const selected = [{ value: ZERO }, ...visible, { value: ZERO }];
    expect(formattingToggleElements(selected)).toEqual(visible);
    expect(formattingToggleElements(selected).some((element) => !element.bold)).toBe(false);
  });
  it('retains blank-only selection defaults', () => {
    const blank = [
      { value: ZERO, bold: false },
      { value: ZERO, bold: true },
    ];
    expect(formattingToggleElements(blank)).toBe(blank);
  });
});
