import { IRow } from '../interface/Row'

/** Layout height is distinct from painted glyph/highlight height. */
export const paragraphRowHeight = (row: IRow) =>
  row.height + (row.offsetY || 0) + (row.spacingIncluded ? 0 : row.spacingAfter || 0)

/** Keep this paragraph and at least the next line together when they fit on an
 * empty page. Long paragraphs retain ordinary wrapping instead of blank pages. */
export function keptParagraphHeight(rows: IRow[], start: number, scale = 1): number {
  const first = rows[start]
  if (!first?.paragraphStart || !first.paragraphLayout?.keepWithNext)
    return first ? paragraphRowHeight(first) : 0
  let height = paragraphRowHeight(first)
  for (let index = start + 1; index < rows.length; index++) {
    const row = rows[index]
    if (row.paragraphStart || !row.paragraphLayout) {
      const firstTableRow = row.elementList[0]?.trList?.[0]
      height += firstTableRow?.height
        ? Math.min(paragraphRowHeight(row), firstTableRow.height * scale)
        : paragraphRowHeight(row)
      return height
    }
    height += paragraphRowHeight(row)
  }
  return height
}

export function paragraphBreakBefore(
  rows: IRow[], index: number, pageHeight: number, pageLimit: number,
  outerHeight: number, hasContent: boolean, scale = 1
): boolean {
  const row = rows[index]
  if (!row || !hasContent || !row.paragraphStart) return false
  if (row.paragraphLayout?.pageBreakBefore) return true
  if (!row.paragraphLayout?.keepWithNext) return false
  const kept = keptParagraphHeight(rows, index, scale)
  return kept <= pageLimit - outerHeight && pageHeight + kept > pageLimit
}
