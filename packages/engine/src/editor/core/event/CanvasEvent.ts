import { EDITOR_ELEMENT_PARAGRAPH_STYLE_ATTR } from '../../dataset/constant/Element'
import { ElementStyleKey } from '../../dataset/enum/ElementStyle'
import { IElement, IElementPosition } from '../../interface/Element'
import { ICurrentPosition, IPositionContext } from '../../interface/Position'
import { Draw } from '../draw/Draw'
import { Position } from '../position/Position'
import { RangeManager } from '../range/RangeManager'
import { deepClone, getUUID, threeClick } from '../../utils'
import { IRange, IRangeElementStyle } from '../../interface/Range'
import { mousedown } from './handlers/mousedown'
import { mouseup } from './handlers/mouseup'
import { mouseleave } from './handlers/mouseleave'
import { mousemove } from './handlers/mousemove'
import { keydown } from './handlers/keydown'
import { input } from './handlers/input'
import { cut } from './handlers/cut'
import { copy } from './handlers/copy'
import { drop } from './handlers/drop'
import click, { getWordRangeBySegmenter } from './handlers/click'
import composition from './handlers/composition'
import drag from './handlers/drag'
import { ICopyOption } from '../../interface/Event'

export interface ICompositionInfo {
  elementList: IElement[]
  startIndex: number
  endIndex: number
  value: string
  defaultStyle: IRangeElementStyle | null
}

export class CanvasEvent {
  public isAllowSelection: boolean
  public isComposing: boolean
  public compositionInfo: ICompositionInfo | null

  public isAllowDrag: boolean
  public isAllowDrop: boolean
  public cacheRange: IRange | null
  public cacheElementList: IElement[] | null
  public cachePositionList: IElementPosition[] | null
  public cachePositionContext: IPositionContext | null
  public mouseDownStartPosition: ICurrentPosition | null

  private touchSelectionEnabled = false
  private touchPointer: {
    id: number
    canvas: HTMLCanvasElement
    range: IRange
    position: IPositionContext
    defaultStyle: IRangeElementStyle | null
  } | null = null
  private draw: Draw
  private pageContainer: HTMLDivElement
  private pageList: HTMLCanvasElement[]
  private range: RangeManager
  private position: Position

  constructor(draw: Draw) {
    this.draw = draw
    this.pageContainer = draw.getPageContainer()
    this.pageList = draw.getPageList()
    this.range = this.draw.getRange()
    this.position = this.draw.getPosition()

    this.isAllowSelection = false
    this.isComposing = false
    this.compositionInfo = null
    this.isAllowDrag = false
    this.isAllowDrop = false
    this.cacheRange = null
    this.cacheElementList = null
    this.cachePositionList = null
    this.cachePositionContext = null
    this.mouseDownStartPosition = null
  }

  public getDraw(): Draw {
    return this.draw
  }

  public setTouchSelectionEnabled(enabled: boolean) {
    this.touchSelectionEnabled = enabled
    if (!enabled) this.cancelTouchSelection()
    this.pageContainer.style.touchAction = enabled ? 'none' : ''
  }

  private touchSelection(evt: PointerEvent, type: 'mousedown' | 'mousemove' | 'mouseup') {
    if (evt.pointerType !== 'touch' || !this.touchSelectionEnabled || this.draw.isReadonly()) return
    // Synthetic selection events must not retarget a live composition into
    // another paragraph or table cell, or emit compatibility mouse events.
    if (this.isComposing) {
      evt.preventDefault()
      return
    }
    const target = type === 'mousedown' ? evt.target : this.touchPointer?.canvas
    if (!(target instanceof HTMLCanvasElement)) return
    if (type === 'mousedown') {
      if (this.touchPointer) return
      this.touchPointer = {
        id: evt.pointerId,
        canvas: target,
        range: deepClone(this.range.getRange()),
        position: deepClone(this.position.getPositionContext()),
        defaultStyle: deepClone(this.range.getDefaultStyle())
      }
      target.setPointerCapture(evt.pointerId)
    } else if (this.touchPointer?.id !== evt.pointerId) return
    evt.preventDefault()
    // The opt-in mode extends a selection; starting inside its highlighted
    // text must not enter the separate mouse text-drag/drop operation.
    if (type === 'mousedown') this.isAllowDrag = true
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: evt.clientX, clientY: evt.clientY, button: 0, buttons: type === 'mouseup' ? 0 : 1 }))
    if (type === 'mousedown') {
      this.isAllowDrag = false
      this.isAllowDrop = false
    }
    if (type === 'mouseup') {
      this.touchPointer = null
      if (target.hasPointerCapture(evt.pointerId)) target.releasePointerCapture(evt.pointerId)
      this.draw.getCursor().focus()
    }
  }

  private cancelTouchSelection(restore = true) {
    const pointer = this.touchPointer
    if (!pointer) return
    // A cancellation is not a drop or a formatting-painter application.
    this.touchPointer = null
    this.isAllowSelection = false
    this.isAllowDrag = false
    this.isAllowDrop = false
    this.cacheRange = null
    this.cacheElementList = null
    this.cachePositionList = null
    this.cachePositionContext = null
    this.mouseDownStartPosition = null
    if (pointer.canvas.hasPointerCapture(pointer.id)) pointer.canvas.releasePointerCapture(pointer.id)
    if (!restore) return
    this.draw.getImageParticle().destroyFloatImage()
    this.position.setPositionContext(pointer.position)
    this.range.replaceRange(pointer.range)
    this.range.setDefaultStyle(pointer.defaultStyle)
    this.draw.render({ isCompute: false, isSubmitHistory: false, isSetCursor: false })
  }

  public destroy() {
    this.cancelTouchSelection(false)
  }

  public register() {
    this.pageContainer.addEventListener('pointerdown', evt => this.touchSelection(evt, 'mousedown'))
    this.pageContainer.addEventListener('pointermove', evt => this.touchSelection(evt, 'mousemove'))
    this.pageContainer.addEventListener('pointerup', evt => this.touchSelection(evt, 'mouseup'))
    this.pageContainer.addEventListener('pointercancel', evt => {
      if (this.touchPointer?.id === evt.pointerId) this.cancelTouchSelection()
    })
    this.pageContainer.addEventListener('lostpointercapture', evt => {
      if (this.touchPointer?.id === evt.pointerId) this.cancelTouchSelection()
    })
    this.pageContainer.addEventListener('click', this.click.bind(this))
    this.pageContainer.addEventListener('mousedown', this.mousedown.bind(this))
    this.pageContainer.addEventListener('mouseup', this.mouseup.bind(this))
    this.pageContainer.addEventListener(
      'mouseleave',
      this.mouseleave.bind(this)
    )
    this.pageContainer.addEventListener('mousemove', this.mousemove.bind(this))
    this.pageContainer.addEventListener('dblclick', this.dblclick.bind(this))
    this.pageContainer.addEventListener('dragover', this.dragover.bind(this))
    this.pageContainer.addEventListener('drop', this.drop.bind(this))
    threeClick(this.pageContainer, this.threeClick.bind(this))
  }

  public setIsAllowSelection(payload: boolean) {
    this.isAllowSelection = payload
    if (!payload) {
      this.applyPainterStyle()
    }
  }

  public setIsAllowDrag(payload: boolean) {
    this.isAllowDrag = payload
    this.isAllowDrop = payload
  }

  public clearPainterStyle() {
    this.pageList.forEach(p => {
      p.style.cursor = 'text'
    })
    this.draw.setPainterStyle(null)
  }

  public applyPainterStyle() {
    const painterStyle = this.draw.getPainterStyle()
    if (!painterStyle) return
    const isDisabled = this.draw.isReadonly() || this.draw.isDisabled()
    if (isDisabled) return
    let selection = this.range.getSelection()
    // 当前不存在选区时：判断光标处是否存词组
    if (!selection) {
      const range = getWordRangeBySegmenter(this)
      if (range) {
        const elementList = this.draw.getElementList()
        selection = elementList.slice(range.startIndex + 1, range.endIndex + 1)
      }
    }
    if (!selection) return
    const paragraphStyleKeys = EDITOR_ELEMENT_PARAGRAPH_STYLE_ATTR
    const painterStyleKeys = Object.keys(painterStyle).filter(
      key => !paragraphStyleKeys.includes(key as keyof IElement)
    )
    selection.forEach(s => {
      painterStyleKeys.forEach(pKey => {
        const key = pKey as keyof typeof ElementStyleKey
        Reflect.set(s, key, painterStyle[key])
      })
    })
    // 目标元素包含一个完整段落时应用标题样式
    const rangeParagraphElementList = this.range.getRangeParagraphElementList()
    const isFullParagraphSelection =
      !!rangeParagraphElementList &&
      rangeParagraphElementList.length === selection.length &&
      rangeParagraphElementList.every(element => selection.includes(element))
    if (isFullParagraphSelection) {
      const titleId = painterStyle.level ? getUUID() : null
      this.draw.setElementProperty(rangeParagraphElementList, {
        rowFlex: painterStyle.rowFlex,
        rowMargin: painterStyle.rowMargin
      })
      if (painterStyle.level && titleId) {
        this.draw.setElementProperty(rangeParagraphElementList, {
          level: painterStyle.level,
          title: painterStyle.title,
          titleId
        })
      } else {
        this.draw.deleteElementProperty(rangeParagraphElementList, [
          'level',
          'title',
          'titleId'
        ])
      }
    }
    this.draw.render({ isSetCursor: false })
    // 清除格式刷
    const painterOptions = this.draw.getPainterOptions()
    if (!painterOptions || !painterOptions.isDblclick) {
      this.clearPainterStyle()
    }
  }

  public selectAll() {
    // 光标在表格内时选择整个表格
    if (this.position.getPositionContext().isTable) {
      this.draw.getTableOperate().tableSelectAll()
    } else {
      const positionList = this.position.getPositionList()
      this.range.setRange(0, positionList.length - 1)
      this.draw.render({
        isSubmitHistory: false,
        isSetCursor: false,
        isCompute: false
      })
    }
  }

  public mousemove(evt: MouseEvent) {
    mousemove(evt, this)
  }

  public mousedown(evt: MouseEvent) {
    mousedown(evt, this)
  }

  public click() {
    // Focus within the pointer gesture: delayed cursor drawing can otherwise
    // drop the first keystrokes before the input agent receives focus. This
    // also keeps iOS keyboard activation within a trusted user event.
    if (!this.draw.isReadonly()) {
      this.draw.getCursor().focus()
    }
  }

  public mouseup(evt: MouseEvent) {
    mouseup(evt, this)
  }

  public mouseleave(evt: MouseEvent) {
    mouseleave(evt, this)
  }

  public keydown(evt: KeyboardEvent) {
    keydown(evt, this)
  }

  public dblclick(evt: MouseEvent) {
    click.dblclick(this, evt)
  }

  public threeClick() {
    click.threeClick(this)
  }

  public input(data: string) {
    input(data, this)
  }

  public async cut() {
    await cut(this)
  }

  public async copy(options?: ICopyOption) {
    await copy(this, options)
  }

  public compositionstart() {
    this.cancelTouchSelection()
    composition.compositionstart(this)
  }

  public compositionend(evt: CompositionEvent) {
    composition.compositionend(this, evt)
  }

  public drop(evt: DragEvent) {
    drop(evt, this)
  }

  public dragover(evt: DragEvent | MouseEvent) {
    drag.dragover(evt, this)
  }
}
