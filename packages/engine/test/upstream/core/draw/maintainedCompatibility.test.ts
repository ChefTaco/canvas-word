import { describe, expect, it } from 'vitest'
import { createTestEditor } from '../../factories/editor'
import { ElementType } from '@/editor/dataset/enum/Element'
import { ListType } from '@/editor/dataset/enum/List'
import { EditorZone } from '@/editor/dataset/enum/Editor'
import type { IElement } from '@/editor/interface/Element'

function list(indent: number, firstLineIndent: number): IElement[] {
  return [{
    type: ElementType.LIST, value: '', listType: ListType.UL,
    valueList: [{ value: 'ListFirst', paragraphLayout: { id: 'paragraph', indent, firstLineIndent } }]
  }]
}

describe('maintained application compatibility', () => {
  it('adds legacy first-line indentation to the list marker inset', () => {
    const plain = createTestEditor({ data: list(0, 0) })
    const styled = createTestEditor({ data: list(25, 10) })
    try {
      const x = (context: typeof plain) => {
        const match = context.editor.command.getKeywordRangeList('ListFirst')[0]
        context.editor.command.executeSetRange(match.startIndex, match.endIndex)
        return context.editor.command.getRangeContext()!.rangeRects[0].x
      }
      expect(x(styled) - x(plain)).toBeCloseTo(35)
    } finally { plain.destroy(); styled.destroy() }
  })

  it('keeps trailing legacy spacing outside selection rectangles and stored properties', () => {
    const context = createTestEditor({ data: [
      { value: 'First', paragraphLayout: { id: 'first', before: 12, after: 18 } },
      { value: '\nSecond', paragraphLayout: { id: 'second', before: 7 } }
    ] })
    try {
      const command = context.editor.command
      const rectangle = (text: string) => {
        const match = command.getKeywordRangeList(text)[0]
        command.executeSetRange(match.startIndex, match.endIndex)
        return command.getRangeContext()!.rangeRects[0]
      }
      const first = rectangle('First'), second = rectangle('Second')
      expect(second.y - first.y - first.height).toBeCloseTo(18)
      const saved = command.getValue().data.main
      expect(saved.some(element => element.spacingBefore !== undefined || element.spacingAfter !== undefined)).toBe(false)
    } finally { context.destroy() }
  })

  it('retains the glyph-ID binding command alongside the ownership-path API', () => {
    const context = createTestEditor({ data: [{ value: 'abc' }] })
    try {
      const command = context.editor.command
      const runtime = command.getRuntimeElementList()
      command.executeSetExternalElementBindings([{ startId: runtime[1].id!, count: 1, externalId: 'legacy', extension: { owner: 'legacy' } }])
      expect(command.getRuntimeElementList()[1].externalId).toBe('legacy')
      command.setExternalElementBindings([{ container: { zone: EditorZone.MAIN }, startIndex: 2, count: 1, expectedText: 'b', externalId: 'path', extension: { owner: 'path' } }])
      expect(command.getRuntimeElementList()[2].externalId).toBe('path')
      const before = command.getValue()
      expect(() => command.setExternalElementBindings([{ container: { zone: EditorZone.MAIN }, startIndex: 2, count: 1, expectedText: 'wrong', externalId: 'invalid', extension: {} }])).toThrow()
      expect(command.getValue()).toEqual(before)
    } finally { context.destroy() }
  })
})
