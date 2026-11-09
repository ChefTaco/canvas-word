import { ZERO } from '../../dataset/constant/Common'
import { ElementType } from '../../dataset/enum/Element'
import { ImageDisplay } from '../../dataset/enum/Common'
import type { IElement } from '../../interface/Element'
import type { IRow } from '../../interface/Row'

/** Opt-in, fixed-paper column bands. Every main-story element owns its section;
 * the first element of each section must be a paragraph marker. */
export interface IContinuousSection {
  id: string
  leadingSpace?: number
  start: 'continuous' | 'nextPage'
  columns: { count: number; gap: number }
}
export interface ISectionGroup {
  section: IContinuousSection
  elements: IElement[]
  startIndex: number
  width: number
}
export interface ISectionRowPlacement {
  pageNo: number
  x: number
  y: number
  width: number
  bandTop: number
  bandBottom: number
  column: number
  count: number
  gap: number
}

export function continuousSectionGroups(
  elements: IElement[],
  innerWidth: number,
  scale: number
): ISectionGroup[] {
  const groups: ISectionGroup[] = []
  const seen = new Set<string>()
  for (const [index, element] of elements.entries()) {
    const section = element.section
    if (
      !section || typeof section.id !== 'string' ||
      !section.id.length || section.id.length > 200 ||
      !['continuous', 'nextPage'].includes(section.start) ||
      (section.leadingSpace !== undefined && (!Number.isFinite(section.leadingSpace) || section.leadingSpace < 0)) ||
      !section.columns || !Number.isInteger(section.columns.count) ||
      section.columns.count < 1 || section.columns.count > 8 ||
      !Number.isFinite(section.columns.gap) || section.columns.gap < 0
    ) throw new Error('Invalid continuous section ownership or columns.')
    const previous = groups.at(-1)
    if (previous?.section.id !== section.id) {
      if (seen.has(section.id) || (element.value !== ZERO &&
        !(element.type && [ElementType.IMAGE, ElementType.TABLE, ElementType.PAGE_BREAK].includes(element.type))))
        throw new Error('Sections must be contiguous and start at a paragraph.')
      seen.add(section.id)
      const width = (innerWidth - section.columns.gap * scale *
        (section.columns.count - 1)) / section.columns.count
      if (!Number.isFinite(width) || width <= 0)
        throw new Error('Continuous section columns exceed the container.')
      groups.push({ section, elements: [], startIndex: index, width })
    } else if (
      previous.section.leadingSpace !== section.leadingSpace ||
      previous.section.start !== section.start ||
      previous.section.columns.count !== section.columns.count ||
      previous.section.columns.gap !== section.columns.gap
    ) throw new Error('A section has inconsistent geometry.')
    if (
      (element.type !== undefined && ![
        ElementType.TEXT, ElementType.SUPERSCRIPT, ElementType.SUBSCRIPT,
        ElementType.IMAGE, ElementType.TABLE, ElementType.PAGE_BREAK
      ].includes(element.type)) ||
      element.listId || element.areaId ||
      element.control || element.paperDirection ||
      (element.imgDisplay !== undefined && ![
        ImageDisplay.INLINE, ImageDisplay.BLOCK
      ].includes(element.imgDisplay))
    ) throw new Error('Unsupported content in continuous section layout.')
    const group = groups.at(-1)
    if (!group) throw new Error('Missing continuous section.')
    if (element.type === ElementType.IMAGE &&
      (!Number.isFinite(element.width) || !Number.isFinite(element.height) ||
        (element.width ?? 0) <= 0 || (element.height ?? 0) <= 0 ||
        (element.width ?? 0) * scale > group.width))
      throw new Error('Section image dimensions exceed the container.')
    group.elements.push(element)
  }
  return groups
}

/** Layout rows in source order. A section followed by a continuous section is
 * balanced; next-page boundaries and the final section retain natural flow.
 * Complete pages fill each column before advancing. No content is truncated. */
export function placeContinuousSections(
  groups: Array<{ section: IContinuousSection; width: number; rows: IRow[] }>,
  bounds: (pageNo: number) => { top: number; bottom: number },
  scale: number
): IRow[] {
  let pageNo = 0
  let top = bounds(0).top
  const result: IRow[] = []
  const extent = (row: IRow) => {
    const value = row.height + (row.offsetY ?? 0)
    if (!Number.isFinite(value) || value < 0)
      throw new Error('Invalid section row height.')
    return value
  }
  for (const [groupIndex, group] of groups.entries()) {
    if (group.section.start === 'nextPage' && result.length) {
      pageNo++
      top = bounds(pageNo).top
    }
    const leading = (group.section.leadingSpace ?? 0) * scale
    if (leading >= bounds(pageNo).bottom - bounds(pageNo).top)
      throw new Error('Section leading space exceeds the page body.')
    const firstRow = group.rows.find(row => extent(row) > 0)
    const firstHeight = leading && firstRow ? extent(firstRow) : 0
    if (leading && firstHeight + leading > bounds(pageNo).bottom - bounds(pageNo).top)
      throw new Error('Section leading paragraph exceeds the page body.')
    if (top + leading + firstHeight > bounds(pageNo).bottom || top + leading >= bounds(pageNo).bottom) {
      pageNo++
      top = bounds(pageNo).top
    }
    top += leading
    let remaining = group.rows.slice()
    const count = group.section.columns.count
    const gap = group.section.columns.gap * scale
    while (remaining.length) {
      const page = bounds(pageNo)
      if (!Number.isFinite(page.top) || !Number.isFinite(page.bottom) ||
        page.bottom <= page.top) throw new Error('Invalid section page bounds.')
      const available = page.bottom - top
      const pack = (height: number) => {
        const columns: IRow[][] = Array.from({ length: count }, () => [])
        const heights = Array.from({ length: count }, () => 0)
        let index = 0
        for (let column = 0; column < count; column++) {
          while (index < remaining.length &&
            heights[column] + extent(remaining[index]) <= height) {
            heights[column] += extent(remaining[index])
            columns[column].push(remaining[index++])
          }
        }
        return { columns, heights, consumed: index }
      }
      let packed = pack(available)
      if (!packed.consumed) {
        if (top === page.top)
          throw new Error('A section row exceeds the page body.')
        pageNo++
        top = bounds(pageNo).top
        continue
      }
      if (packed.consumed === remaining.length &&
        groups[groupIndex + 1]?.section.start === 'continuous') {
        let low = 0
        let high = available
        // Monotone greedy partition: bounded independently of document length.
        for (let i = 0; i < 52; i++) {
          const middle = (low + high) / 2
          if (pack(middle).consumed === remaining.length) high = middle
          else low = middle
        }
        packed = pack(high)
      }
      const bottom = top + Math.max(...packed.heights)
      for (const [column, rows] of packed.columns.entries()) {
        let y = top
        for (const row of rows) {
          row.sectionPlacement = {
            pageNo, x: column * (group.width + gap), y,
            width: group.width, bandTop: top, bandBottom: bottom,
            column, count, gap
          }
          row.columnIndex = column
          result.push(row)
          y += extent(row)
        }
      }
      remaining = remaining.slice(packed.consumed)
      top = bottom
      if (remaining.length) {
        pageNo++
        top = bounds(pageNo).top
      }
    }
  }
  return result
}


/** A slot is a column of one section, with bounds supplied in scaled pixels. */
export interface ISectionPageConfig {
  pageNo: number
  count: number
  width: number
  gap: number
  bounds(pageNo: number): { top: number; bottom: number }
  fullBounds(pageNo: number): { top: number; bottom: number }
}

/** Reuse the table/paragraph pager for bands, including repeated headers and
 * oversized-row fallback. Rebalance only the final page before a continuous
 * successor; each trial starts from the original measured rows. */
export function paginateContinuousSections(
  groups: Array<{ section: IContinuousSection; width: number; rows: IRow[] }>,
  bounds: (pageNo: number, sectionId: string) => { top: number; bottom: number },
  scale: number,
  paginate: (rows: IRow[], config: ISectionPageConfig) => IRow[]
): IRow[] {
  const result: IRow[] = []
  let pageNo = 0
  let top = groups[0] ? bounds(0, groups[0].section.id).top : 0
  for (const [index, group] of groups.entries()) {
    if (group.section.start === 'nextPage' && result.length) pageNo++
    let initial = bounds(pageNo, group.section.id)
    top = group.section.start === 'nextPage' || !result.length ? initial.top : Math.max(top, initial.top)
    const leading = (group.section.leadingSpace ?? 0) * scale
    if (leading >= initial.bottom - initial.top)
      throw new Error('Section leading space exceeds the page body.')
    const firstRow = group.rows.find(row => row.height + (row.offsetY ?? 0) > 0)
    const firstHeight = leading && firstRow ? firstRow.height + (firstRow.offsetY ?? 0) : 0
    if (leading && firstHeight + leading > initial.bottom - initial.top)
      throw new Error('Section leading paragraph exceeds the page body.')
    if (top + leading + firstHeight > initial.bottom || top + leading >= initial.bottom) {
      pageNo++
      initial = bounds(pageNo, group.section.id)
      top = initial.top
    }
    top += leading
    const start = pageNo
    const run = (lastPage?: number, limit?: number) => paginate(group.rows.map(row => {
      const measured = {...row}
      delete measured.columnIndex
      delete measured.sectionPlacement
      delete measured.paginationBreakBefore
      return measured
    }), {
      pageNo: start, count: group.section.columns.count,
      width: group.width, gap: group.section.columns.gap * scale,
      fullBounds: page => bounds(page, group.section.id),
      bounds: page => {
        const box = bounds(page, group.section.id)
        const value = { top: page === start ? top : box.top,
          bottom: page === lastPage && limit !== undefined ? limit : box.bottom }
        if (!Number.isFinite(value.top) || !Number.isFinite(value.bottom) || value.bottom <= value.top)
          throw new Error('Invalid section page bounds.')
        return value
      }
    })
    let rows = run()
    let last = rows.at(-1)?.sectionPlacement?.pageNo ?? start
    if (groups[index + 1]?.section.start === 'continuous' && group.section.columns.count > 1) {
      const box = bounds(last, group.section.id)
      let low = last === start ? top : box.top
      let high = box.bottom
      for (let trial = 0; trial < 32; trial++) {
        const middle = (low + high) / 2
        const candidate = run(last, middle)
        if ((candidate.at(-1)?.sectionPlacement?.pageNo ?? start) <= last &&
          candidate.every(row => row.sectionPlacement &&
            row.sectionPlacement.y + row.height + (row.offsetY ?? 0) <=
              (row.sectionPlacement.pageNo === last ? middle : bounds(row.sectionPlacement.pageNo, group.section.id).bottom) + 1e-7)) high = middle
        else low = middle
      }
      rows = run(last, high + 1e-7)
      last = rows.at(-1)?.sectionPlacement?.pageNo ?? start
    }
    const ends = new Map<number, number>()
    for (const row of rows) {
      const placement = row.sectionPlacement
      if (placement) ends.set(placement.pageNo, Math.max(ends.get(placement.pageNo) ?? 0,
        placement.y + row.height + (row.offsetY ?? 0)))
    }
    for (const row of rows) {
      const p = row.sectionPlacement
      if (p) p.bandBottom = ends.get(p.pageNo) ?? p.bandBottom
      if (!p || p.y + row.height + (row.offsetY ?? 0) > bounds(p.pageNo, group.section.id).bottom + 1e-6)
        throw new Error('Section content exceeds the page body.')
      result.push(row)
    }
    pageNo = last
    top = Math.max(...rows.filter(row => row.sectionPlacement?.pageNo === last)
      .map(row => (row.sectionPlacement?.y ?? 0) + row.height + (row.offsetY ?? 0)), bounds(last, group.section.id).top)
  }
  result.forEach((row, index) => { row.rowIndex = index })
  return result
}
