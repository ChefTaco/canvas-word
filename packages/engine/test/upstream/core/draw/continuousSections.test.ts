import { afterEach, describe, expect, it } from 'vitest'
import { Draw } from '@/editor/core/draw/Draw'
import { EventBus } from '@/editor/core/event/eventbus/EventBus'
import { Listener } from '@/editor/core/listener/Listener'
import { Override } from '@/editor/core/override/Override'
import { ElementType } from '@/editor/dataset/enum/Element'
import type { IElement } from '@/editor/interface/Element'
import type { IEditorOption } from '@/editor/interface/Editor'
import { formatElementList } from '@/editor/utils/element'
import { mergeOption } from '@/editor/utils/option'
import { continuousSectionGroups, placeContinuousSections } from '@/editor/core/layout/ContinuousSections'
import type { IContinuousSection } from '@/editor/core/layout/ContinuousSections'
import type { IRow } from '@/editor/interface/Row'

const draws: Draw[] = []
function section(id: string, count: number, start: 'continuous' | 'nextPage' = 'continuous'): IContinuousSection {
  return { id, start, columns: { count, gap: 20 } }
}
function layout(main: IElement[], override: IEditorOption = {}) {
  const options = mergeOption({
    width: 300, height: 240, margins: [20, 20, 20, 20],
    preserveLeadingParagraph: true,
    header: { disabled: true }, footer: { disabled: true },
    defaultRowMargin: 0, defaultBasicRowMarginHeight: 0, ...override
  })
  formatElementList(main, { editorOptions: options, isForceCompensation: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const draw = new Draw(host, options, { main, header: [], footer: [] },
    new Listener(), new EventBus(), new Override())
  draws.push(draw)
  draw.render({ isLazy: false })
  return draw
}
function rows(heights: number[]): IRow[] {
  return heights.map((height, i) => ({
    width: 10, height, ascent: height, startIndex: i,
    rowIndex: i, elementList: []
  }))
}
afterEach(() => {
  for (const draw of draws.splice(0)) draw.destroy()
  document.body.replaceChildren()
})
describe('continuous column bands', () => {
  it('balances the last page before a full-width band and resumes below it', () => {
    const result = placeContinuousSections([
      { section: section('prose', 2), width: 120, rows: rows([20, 20, 20, 20, 20, 20]) },
      { section: section('map', 1), width: 260, rows: rows([60]) },
      { section: section('more', 2), width: 120, rows: rows([20, 20, 20, 20]) }
    ], () => ({ top: 20, bottom: 220 }), 1)
    expect(result.map(row => [row.sectionPlacement?.column, row.sectionPlacement?.y]))
      .toEqual([[0,20],[0,40],[0,60],[1,20],[1,40],[1,60],
        [0,80],[0,140],[0,160],[0,180],[0,200]])
    expect(result.every(row => row.sectionPlacement?.pageNo === 0)).toBe(true)
    expect(result[6].sectionPlacement?.width).toBe(260)
  })
  it('fills complete pages and balances only the tail', () => {
    const result = placeContinuousSections([
      { section: section('a', 2), width: 120, rows: rows(Array.from({ length: 23 }, () => 20)) },
      { section: section('following', 1), width: 260, rows: [] }
    ], () => ({ top: 20, bottom: 220 }), 1)
    expect(result.filter(row => row.sectionPlacement?.pageNo === 0)).toHaveLength(20)
    expect(result.slice(20).map(row => [row.sectionPlacement?.column, row.sectionPlacement?.y]))
      .toEqual([[0,20],[0,40],[1,20]])
  })
  it('moves an indivisible object to the next page without resizing', () => {
    const result = placeContinuousSections([
      { section: section('a', 1), width: 260, rows: rows([160]) },
      { section: section('map', 1), width: 260, rows: rows([100]) }
    ], () => ({ top: 20, bottom: 220 }), 1)
    expect(result[1].sectionPlacement).toMatchObject({ pageNo: 1, y: 20 })
    expect(result[1].height).toBe(100)
  })
  it('retains explicit next-page boundaries and page-specific story clearance', () => {
    const result = placeContinuousSections([
      { section: section('a', 1), width: 260, rows: rows([20]) },
      { section: section('b', 1, 'nextPage'), width: 260, rows: rows([20]) }
    ], page => ({ top: 20 + page * 10, bottom: 220 }), 1)
    expect(result[1].sectionPlacement).toMatchObject({ pageNo: 1, y: 30 })
  })
  it('accounts for paragraph spacing and zero-height hidden rows', () => {
    const input = rows([20, 0, 20, 20])
    input[0].offsetY = 10
    const result = placeContinuousSections([
      { section: section('a', 2), width: 120, rows: input },
      { section: section('following', 1), width: 260, rows: [] }
    ], () => ({ top: 20, bottom: 220 }), 1)
    expect(result.map(row => row.sectionPlacement?.y)).toEqual([20,50,20,40])
    expect(result[0].sectionPlacement?.bandBottom).toBe(60)
  })
  it('rejects rows taller than the body and invalid extents instead of clipping', () => {
    for (const height of [201, -1, NaN, Infinity])
      expect(() => placeContinuousSections([
        { section: section('a', 1), width: 260, rows: rows([height]) }
      ], () => ({ top: 20, bottom: 220 }), 1)).toThrow()
  })
  it('matches exhaustive contiguous partitions for unequal row heights', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const heights = Array.from({ length: 7 }, (_, i) =>
        ((seed * 17 + i * 29) % 37) + 1)
      const optimal = (values: number[], columns: number): number => {
        if (columns === 1) return values.reduce((a, b) => a + b, 0)
        let best = Infinity, prefix = 0
        for (let split = 0; split <= values.length; split++) {
          best = Math.min(best, Math.max(prefix,
            optimal(values.slice(split), columns - 1)))
          prefix += values[split] ?? 0
        }
        return best
      }
      for (const count of [1,2,3]) {
        const input = rows(heights)
        const result = placeContinuousSections([
          { section: section('a', count), width: 100, rows: input },
          { section: section('following', 1), width: 260, rows: [] }
        ], () => ({ top: 20, bottom: 500 }), 1)
        expect(result).toHaveLength(input.length)
        expect(result[0].sectionPlacement?.bandBottom)
          .toBeCloseTo(20 + optimal(heights, count), 8)
        expect(result.every((row, i) => row === input[i])).toBe(true)
      }
    }
  })
  it('keeps the final document section unbalanced after full-page overflow', () => {
    const result = placeContinuousSections([
      { section: section('last', 2), width: 120, rows: rows(Array.from({ length: 23 }, () => 20)) }
    ], () => ({ top: 20, bottom: 220 }), 1)
    expect(result.slice(20).map(row => [row.sectionPlacement?.column, row.sectionPlacement?.y]))
      .toEqual([[0,20],[0,40],[0,60]])
  })
  it('retains natural columns before an explicit next-page section', () => {
    const result = placeContinuousSections([
      { section: section('first', 2), width: 120, rows: rows([20,20,20]) },
      { section: section('next', 1, 'nextPage'), width: 260, rows: rows([20]) }
    ], () => ({ top: 20, bottom: 220 }), 1)
    expect(result.slice(0,3).map(row => [row.sectionPlacement?.column, row.sectionPlacement?.y]))
      .toEqual([[0,20],[0,40],[0,60]])
    expect(result[3].sectionPlacement).toMatchObject({ pageNo: 1, y: 20 })
  })
  it.each([0, 9, 1.5, NaN])('rejects invalid column count %s', count => {
    expect(() => continuousSectionGroups([
      { value: '\n', section: section('a', count) }
    ], 260, 1)).toThrow()
  })
  it.each([-1, Infinity, NaN, 300])('rejects invalid or impossible gaps %s', gap => {
    const value = section('a', 2)
    value.columns.gap = gap
    expect(() => continuousSectionGroups([
      { value: '\n', section: value }
    ], 260, 1)).toThrow()
  })
  it('rejects overflow and global column combinations rather than clipping', () => {
    expect(() => layout([
      { value: '\nW', letterSpacing: 300, section: section('a', 2) }
    ])).toThrow(/exceeds|indent/i)
    expect(() => layout([
      { value: '\nA', section: section('a', 2) }
    ], { column: { count: 2, gap: 20 } })).toThrow(/global columns/)
  })
  it('rejects missing, reused or inconsistent section ownership', () => {
    const a = section('a', 2), b = section('b', 1)
    for (const input of [
      [{ value: '\n', section: a }, { value: 'x' }],
      [{ value: '\n', section: a }, { value: '\n', section: b }, { value: '\n', section: a }],
      [{ value: '\n', section: a }, { value: 'x', section: section('a', 1) }],
      [{ value: '\n', section: a }, { value: 'x', section: b }]
    ]) expect(() => continuousSectionGroups(input, 260, 1)).toThrow()
  })
  it('rejects oversized images while retaining section-owned tables and flow', () => {
    const a = section('a', 2)
    for (const content of [
      { value: '\n', type: ElementType.IMAGE, width: 121, height: 20 }
    ]) expect(() => continuousSectionGroups([{ ...content, section: a }], 260, 1)).toThrow()
    expect(continuousSectionGroups([{value:'\u0000',keepTogether:true,section:a}],260,1)).toHaveLength(1)
  })
  it.each([0.5, 1, 2])('wraps, positions, serializes and reopens changing columns at scale %s', scale => {
    const a = section('a', 2), b = section('b', 1), c = section('c', 2)
    const draw = layout([
      { value: '\n' + 'x'.repeat(32), section: a, lineHeight: { rule: 'exact', value: 20 } },
      { value: '\nWide map caption', section: b, lineHeight: { rule: 'exact', value: 20 } },
      { value: '\n' + 'y'.repeat(32), section: c, lineHeight: { rule: 'exact', value: 20 } }
    ], { scale })
    const positions = draw.getPosition().getPositionList()
    const allRows = draw.getRowList()
    for (const row of allRows) {
      expect(row.sectionPlacement).toBeDefined()
      expect(positions[row.startIndex].coordinate.leftTop[0])
        .toBeCloseTo(20 * scale + (row.sectionPlacement?.x ?? 0))
      expect(positions[row.startIndex].coordinate.leftTop[1])
        .toBeCloseTo(row.sectionPlacement?.y ?? -1)
      expect(row.width).toBeLessThanOrEqual(row.sectionPlacement?.width ?? 0)
    }
    const saved = draw.getValue()
    expect(saved.data.main[0].section).toEqual(a)
    const reopened = layout(saved.data.main, { scale })
    expect(reopened.getRowList().map(row => row.sectionPlacement))
      .toEqual(allRows.map(row => row.sectionPlacement))
  })
})
