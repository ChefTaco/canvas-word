import type { IDrawRowPayload } from '../../interface/Draw'
import type { IRenderContext } from '../render/model/RenderContext'

/** Draw paragraph boxes behind text, once per contiguous page/column fragment.
 * Source paragraph identity, not coincidental run formatting, owns the box. */
export function drawParagraphPresentation(ctx: IRenderContext, payload: IDrawRowPayload, scale: number): void {
  const { rowList, positionList, innerWidth } = payload
  for (let index = 0; index < rowList.length; index++) {
    const first = rowList[index]
    const element = first.elementList[0]
    const presentation = element?.paragraphPresentation
    const position = positionList[first.startIndex]
    if (!presentation || !element.paragraphId || !position) continue
    let lastIndex = index
    while (rowList[lastIndex + 1]?.elementList[0]?.paragraphId === element.paragraphId &&
      rowList[lastIndex + 1]?.sectionPlacement?.column === first.sectionPlacement?.column) lastIndex++
    const last = rowList[lastIndex]
    const end = positionList[last.startIndex]
    if (!end) throw new Error('Paragraph presentation has no owned geometry.')
    const container = first.sectionPlacement?.width ?? innerWidth
    const left = (element.indentLeft ?? 0) * scale
    const right = (element.indentRight ?? 0) * scale
    const available = container - (first.offsetX ?? 0) - right
    const align = first.rowFlex === 'center' ? (available - first.width) / 2 :
      first.rowFlex === 'right' ? available - first.width : 0
    const x = position.coordinate.leftTop[0] - align - (first.offsetX ?? 0) + left
    const y = position.coordinate.leftTop[1]
    const bottom = end.coordinate.leftTop[1] + last.height - (last.spacingAfter ?? 0) - (last.paragraphBottom ?? 0)
    const width = container - left - right
    const borders = presentation.borders
    const leftEdge = x - (borders?.left?.space ?? 0) * scale
    const rightEdge = x + width + (borders?.right?.space ?? 0) * scale
    const topEdge = y - (borders?.top?.space ?? 0) * scale
    const bottomEdge = bottom + (borders?.bottom?.space ?? 0) * scale
    ctx.save()
    if (presentation.shading) {
      ctx.fillStyle = presentation.shading
      ctx.fillRect(leftEdge, topEdge, rightEdge-leftEdge, bottomEdge-topEdge)
    }
    for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
      const border = borders?.[edge]
      if (!border) continue
      ctx.strokeStyle = border.color; ctx.lineWidth = border.width * scale
      ctx.beginPath()
      ctx.moveTo(edge === 'right' ? rightEdge : leftEdge, edge === 'bottom' ? bottomEdge : topEdge)
      ctx.lineTo(edge === 'left' ? leftEdge : rightEdge, edge === 'top' ? topEdge : bottomEdge)
      ctx.stroke()
    }
    ctx.restore()
    index = lastIndex
  }
}
