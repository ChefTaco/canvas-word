import { ZERO } from '../../dataset/constant/Common'
import type { IRow } from '../../interface/Row'

/** Opt-in paragraph gap collapsing and outer-border space. Called on measured
 * rows, before table/section pagination. Only adjacent owned text paragraphs
 * share a gap; cells, stories and object boundaries remain separate. */
export function applyParagraphBoxes(rows: IRow[], scale: number, insideCell = false): void {
  let previous: IRow | undefined
  for (let start = 0; start < rows.length;) {
    const first = rows[start]
    const owner = first.elementList[0]
    if (owner?.paragraphSpacing !== 'collapse' || !owner.paragraphId) {
      previous = undefined
      start++
      continue
    }
    let end = start
    while (rows[end + 1]?.elementList[0]?.paragraphId === owner.paragraphId) end++
    const last = rows[end]
    if (owner.cellTerminal) {
      if (!insideCell || start === 0 || end !== rows.length - 1 ||
        rows[start - 1].elementList[0]?.type !== 'table' || rows.slice(start, end + 1).some(row => row.elementList.some(element =>
        element.value !== ZERO && element.value !== '')))
        throw new Error('Cell terminators require an empty table-cell paragraph.')
      for (const row of rows.slice(start, end + 1)) {
        row.height = 0; row.ascent = 0; row.offsetY = 0; row.spacingAfter = 0
      }
      previous = undefined
      start = end + 1
      continue
    }
    // Hidden review rows cannot introduce gaps or interrupt visible adjacency.
    if (!rows.slice(start, end + 1).some(row => row.height > 0)) {
      start = end + 1
      continue
    }
    if (previous) first.offsetY = (first.offsetY ?? 0) -
      Math.min(owner.spacingBefore ?? 0, (previous.spacingAfter ?? 0) / scale) * scale
    const borders = owner.paragraphPresentation?.borders
    const space = (edge: 'top' | 'bottom') => {
      const border = borders?.[edge]
      if (!border) return 0
      if (![border.width, border.space].every(Number.isFinite) || border.width < 0 || border.space < 0)
        throw new Error('Invalid paragraph border geometry.')
      return (border.width + border.space) * scale
    }
    first.offsetY = (first.offsetY ?? 0) + space('top')
    last.paragraphBottom = space('bottom')
    last.height += last.paragraphBottom
    previous = last
    start = end + 1
  }
}
