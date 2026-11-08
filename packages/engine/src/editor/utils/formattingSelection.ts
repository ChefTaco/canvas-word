import { ZERO } from '../dataset/constant/Common'
import { IElement } from '../interface/Element'

/** Paragraph sentinels carry insertion defaults, not visible toggle state.
 * Preserve blank-paragraph formatting when no visible content is selected. */
export function formattingToggleElements(selection: IElement[]): IElement[] {
  const visible = selection.filter(element => element.value !== ZERO)
  return visible.length ? visible : selection
}
