import { IElement } from '../../..'
import { EDITOR_PREFIX } from '../../../dataset/constant/Editor'
import { IEditorOption } from '../../../interface/Editor'
import { IElementPosition } from '../../../interface/Element'
import { IRowElement } from '../../../interface/Row'
import { Draw } from '../Draw'
import { safeHyperlink } from '../../../utils/hyperlink'

export class HyperlinkParticle {
  private draw: Draw
  private options: Required<IEditorOption>
  private container: HTMLDivElement
  private hyperlinkPopupContainer: HTMLDivElement
  private hyperlinkDom: HTMLAnchorElement

  constructor(draw: Draw) {
    this.draw = draw
    this.options = draw.getOptions()
    this.container = draw.getContainer()
    const { hyperlinkPopupContainer, hyperlinkDom } =
      this._createHyperlinkPopupDom()
    this.hyperlinkDom = hyperlinkDom
    this.hyperlinkPopupContainer = hyperlinkPopupContainer
  }

  private _createHyperlinkPopupDom() {
    const hyperlinkPopupContainer = document.createElement('div')
    hyperlinkPopupContainer.classList.add(`${EDITOR_PREFIX}-hyperlink-popup`)
    const hyperlinkDom = document.createElement('a')
    hyperlinkDom.target = '_blank'
    hyperlinkDom.rel = 'noopener noreferrer'
    hyperlinkPopupContainer.append(hyperlinkDom)
    this.container.append(hyperlinkPopupContainer)
    return { hyperlinkPopupContainer, hyperlinkDom }
  }

  public drawHyperlinkPopup(element: IElement, position: IElementPosition) {
    const {
      coordinate: {
        leftTop: [left, top]
      },
      lineHeight
    } = position
    const { x: preX, y: preY } = this.draw.getPageOffset(this.draw.getPageNo())
    // 位置
    this.hyperlinkPopupContainer.style.display = 'block'
    this.hyperlinkPopupContainer.style.left = `${left + preX}px`
    this.hyperlinkPopupContainer.style.top = `${top + preY + lineHeight}px`
    // 标签
    const url = element.url || '#'
    const safe = safeHyperlink(url)
    if (safe) { this.hyperlinkDom.href = safe; this.hyperlinkDom.removeAttribute('aria-disabled') }
    else { this.hyperlinkDom.removeAttribute('href'); this.hyperlinkDom.setAttribute('aria-disabled', 'true') }
    this.hyperlinkDom.title = url
    this.hyperlinkDom.innerText = url
  }

  public clearHyperlinkPopup() {
    this.hyperlinkPopupContainer.style.display = 'none'
  }

  public openHyperlink(element: IElement) {
    const safe = safeHyperlink(element.url)
    if (!safe) return
    const newTab = window.open(safe, '_blank', 'noopener,noreferrer')
    if (newTab) {
      newTab.opener = null
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    element: IRowElement,
    x: number,
    y: number
  ) {
    ctx.save()
    ctx.font = element.style
    ctx.fillStyle = element.color || this.options.defaultHyperlinkColor
    ctx.fillText(element.value, x, y)
    ctx.restore()
  }
}
