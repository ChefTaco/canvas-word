import { EDITOR_PREFIX } from '../../dataset/constant/Editor'
import { EventBusMap } from '../../interface/EventBus'
import { Draw } from '../draw/Draw'
import { CanvasEvent } from '../event/CanvasEvent'
import { EventBus } from '../event/eventbus/EventBus'
import { pasteByEvent } from '../event/handlers/paste'

export class CursorAgent {
  private draw: Draw
  private container: HTMLDivElement
  private agentCursorDom: HTMLTextAreaElement
  private canvasEvent: CanvasEvent
  private eventBus: EventBus<EventBusMap>

  constructor(draw: Draw, canvasEvent: CanvasEvent) {
    this.draw = draw
    this.container = draw.getContainer()
    this.canvasEvent = canvasEvent
    this.eventBus = draw.getEventBus()
    // 代理光标绘制
    const agentCursorDom = document.createElement('textarea')
    agentCursorDom.autocomplete = 'off'
    agentCursorDom.classList.add(`${EDITOR_PREFIX}-inputarea`)
    agentCursorDom.innerText = ''
    this.container.append(agentCursorDom)
    this.agentCursorDom = agentCursorDom
    // 事件
    agentCursorDom.onkeydown = (evt: KeyboardEvent) => this._keyDown(evt)
    agentCursorDom.oninput = this._input.bind(this)
    agentCursorDom.onbeforeinput = this._beforeInput.bind(this)
    agentCursorDom.onpaste = (evt: ClipboardEvent) => this._paste(evt)
    agentCursorDom.addEventListener(
      'compositionstart',
      this._compositionstart.bind(this)
    )
    agentCursorDom.addEventListener(
      'compositionend',
      this._compositionend.bind(this)
    )
  }

  public getAgentCursorDom(): HTMLTextAreaElement {
    return this.agentCursorDom
  }

  private _keyDown(evt: KeyboardEvent) {
    // The native handler owns these edits. Cancel the proxy's default action
    // so it cannot issue a second beforeinput edit after the same keydown.
    if (!evt.isComposing && !this.canvasEvent.isComposing && ['Backspace', 'Delete', 'Enter'].includes(evt.key)) evt.preventDefault()
    this.canvasEvent.keydown(evt)
  }

  private _beforeInput(evt: InputEvent) {
    // Virtual keyboards can express these intentions without a keydown event.
    // Reuse the existing handlers so graphemes, tables and traces share the
    // same behavior. Native keydown handlers already cancel their default edit.
    if (evt.defaultPrevented || !evt.cancelable || evt.isComposing || this.canvasEvent.isComposing) return
    const keys: Record<string, string> = {
      deleteContentBackward: 'Backspace',
      deleteContentForward: 'Delete',
      insertParagraph: 'Enter',
      insertLineBreak: 'Enter'
    }
    const key = keys[evt.inputType]
    if (!key) return
    evt.preventDefault()
    if (this.draw.isReadonly() || this.draw.isDisabled()) return
    this.canvasEvent.keydown(new KeyboardEvent('keydown', {
      key,
      shiftKey: evt.inputType === 'insertLineBreak',
      cancelable: true
    }))
  }

  private _input(evt: Event) {
    const data = (<InputEvent>evt).data
    if (data) {
      this.canvasEvent.input(data)
    }
    if (this.eventBus.isSubscribe('input')) {
      this.eventBus.emit('input', evt)
    }
  }

  private _paste(evt: ClipboardEvent) {
    const isReadonly = this.draw.isReadonly()
    if (isReadonly) return
    const clipboardData = evt.clipboardData
    if (!clipboardData) return
    pasteByEvent(this.canvasEvent, evt)
    evt.preventDefault()
  }

  private _compositionstart() {
    this.canvasEvent.compositionstart()
  }

  private _compositionend(evt: CompositionEvent) {
    this.canvasEvent.compositionend(evt)
  }
}
