import { Draw } from '../draw/Draw'
import { I18n } from '../i18n/I18n'
import { EDITOR_PREFIX } from '../../dataset/constant/Editor'
import { ZERO } from '../../dataset/constant/Common'
import { IRange } from '../../interface/Range'
import { IElement } from '../../interface/Element'
import { ElementType } from '../../dataset/enum/Element'
import { ListType } from '../../dataset/enum/List'
import { TitleLevel } from '../../dataset/enum/Title'

const headingTags: Record<TitleLevel, string> = {
  [TitleLevel.FIRST]: 'h1',
  [TitleLevel.SECOND]: 'h2',
  [TitleLevel.THIRD]: 'h3',
  [TitleLevel.FOURTH]: 'h4',
  [TitleLevel.FIFTH]: 'h5',
  [TitleLevel.SIXTH]: 'h6'
}

// 屏幕阅读器播报管理器
// 通过 aria-live 区域向辅助技术播报编辑器状态变更
export class Accessibility {
  private draw: Draw
  private i18n: I18n
  private disabled: boolean
  private assertiveDom: HTMLDivElement | null = null
  private rangeChangeHandler: ((payload: IRange) => void) | null = null
  // Fork: off-screen text mirror (option accessibility.textMirror)
  private mirrorDom: HTMLDivElement | null = null
  private mirrorBlocks: Array<{ start: number; end: number; dom: HTMLElement }> = []
  private mirrorTimer: ReturnType<typeof setTimeout> | null = null
  private contentChangeHandler: (() => void) | null = null

  constructor(draw: Draw) {
    this.draw = draw
    this.i18n = draw.getI18n()
    this.disabled = draw.getOptions().accessibility.disabled

    if (this.disabled) return

    // 创建对屏幕阅读器可见、对普通用户隐藏的 aria-live 容器
    const wrapper = document.createElement('div')
    wrapper.className = `${EDITOR_PREFIX}-sr-only`

    this.assertiveDom = document.createElement('div')
    this.assertiveDom.setAttribute('aria-live', 'assertive')
    this.assertiveDom.setAttribute('aria-atomic', 'true')

    wrapper.appendChild(this.assertiveDom)
    if (draw.getOptions().accessibility.textMirror) {
      this.mirrorDom = document.createElement('div')
      this.mirrorDom.setAttribute('role', 'document')
      this.mirrorDom.setAttribute('aria-label', this.i18n.t('accessibility.document'))
      wrapper.appendChild(this.mirrorDom)
    }
    draw.getContainer().appendChild(wrapper)

    // 监听选区变化，自动播报选中文本
    this.rangeChangeHandler = this.handleRangeChange.bind(this)
    const eventBus = this.draw.getEventBus()
    eventBus.on('rangeChange', this.rangeChangeHandler)
    if (this.mirrorDom) {
      this.contentChangeHandler = () => this.scheduleMirror()
      eventBus.on('contentChange', this.contentChangeHandler)
      this.scheduleMirror()
    }
  }

  private scheduleMirror(): void {
    if (this.mirrorTimer) return
    this.mirrorTimer = setTimeout(() => {
      this.mirrorTimer = null
      this.refreshMirror()
    }, 50)
  }

  // Fork: rebuild the off-screen copy of the main text from the element list
  public refreshMirror(): void {
    if (this.disabled || !this.mirrorDom) return
    const elementList = this.draw.getOriginalMainElementList()
    const fragment = document.createDocumentFragment()
    const blocks: Array<{ start: number; end: number; dom: HTMLElement }> = []
    let list: { type: ListType; dom: HTMLElement; id?: string } | null = null
    let paragraph: { start: number; text: string; element: IElement } | null = null
    const text = (value: string) => value.replace(new RegExp(ZERO, 'g'), '')
    const flush = (end: number) => {
      if (!paragraph) return
      // Blank lines (including the one kept after a table) are not mirrored.
      if (!paragraph.text.trim()) { paragraph = null; return }
      const { element } = paragraph
      const tag = element.level ? headingTags[element.level] : element.listType ? 'li' : 'p'
      const dom = document.createElement(tag)
      dom.textContent = paragraph.text
      if (tag === 'li') {
        if (!list || list.type !== element.listType || list.id !== element.listId) {
          list = { type: element.listType!, id: element.listId, dom: document.createElement(element.listType === ListType.OL ? 'ol' : 'ul') }
          fragment.appendChild(list.dom)
        }
        list.dom.appendChild(dom)
      } else {
        list = null
        fragment.appendChild(dom)
      }
      blocks.push({ start: paragraph.start, end, dom })
      paragraph = null
    }
    for (let index = 0; index < elementList.length; index++) {
      const element = elementList[index]
      if (element.type === ElementType.TABLE) {
        flush(index - 1)
        list = null
        const table = document.createElement('table')
        for (const tr of element.trList || []) {
          const row = document.createElement('tr')
          for (const td of tr.tdList) {
            const cell = document.createElement('td')
            cell.textContent = td.value.map(item => item.type === ElementType.TABLE ? '' : text(item.value)).join('')
            row.appendChild(cell)
          }
          table.appendChild(row)
        }
        fragment.appendChild(table)
        blocks.push({ start: index, end: index, dom: table })
        continue
      }
      // A paragraph starts at a line-break placeholder unless it is a soft break.
      const soft = element.value === ZERO && element.paragraphBreak === false
      if (index > 0 && !soft && (element.value === '\n' || element.value === ZERO)) flush(index - 1)
      if (!paragraph) paragraph = { start: index, text: '', element }
      if (!paragraph.element.level && element.level) paragraph.element = element
      if (!paragraph.element.level && !paragraph.element.listType && element.listType) paragraph.element = element
      if (soft) paragraph.text += ' '
      else if (element.type !== ElementType.IMAGE) paragraph.text += text(element.value).replace(/\n/g, '')
    }
    flush(elementList.length - 1)
    this.mirrorDom.replaceChildren(fragment)
    this.mirrorBlocks = blocks
    this.markCurrent()
  }

  // Fork: mark the mirrored paragraph or table that holds the caret
  private markCurrent(): void {
    if (!this.mirrorDom) return
    const context = this.draw.getPosition().getPositionContext()
    const index = context.isTable ? context.index ?? -1 : this.draw.getRange().getRange().startIndex
    for (const block of this.mirrorBlocks) {
      if (index >= block.start && index <= block.end) block.dom.setAttribute('aria-current', 'true')
      else block.dom.removeAttribute('aria-current')
    }
  }

  private handleRangeChange(range: IRange): void {
    this.markCurrent()
    if (range.startIndex === range.endIndex) return
    this.selection()
  }

  // 播报选区文本
  public selection(): void {
    if (this.disabled) return
    const text = this.draw.getRange().toString()
    if (!text.trim()) return
    const prefix = this.i18n.t('accessibility.selected')
    this.assertive(`${prefix}${text}`)
  }

  // 播报输入内容
  public input(data: string): void {
    if (this.disabled) return
    const text = data.replace(new RegExp(ZERO, 'g'), '').replace(/\n/g, '')
    if (!text.trim()) return
    const prefix = this.i18n.t('accessibility.input')
    this.assertive(`${prefix}${text}`)
  }

  // assertive 模式播报（立即打断当前朗读）
  public assertive(message: string): void {
    if (this.disabled || !this.assertiveDom) return
    this.assertiveDom.textContent = ''
    void this.assertiveDom.offsetHeight
    this.assertiveDom.textContent = message
  }

  public destroy(): void {
    if (this.disabled) return
    if (this.rangeChangeHandler) {
      const eventBus = this.draw.getEventBus()
      eventBus.off('rangeChange', this.rangeChangeHandler)
    }
    if (this.contentChangeHandler) this.draw.getEventBus().off('contentChange', this.contentChangeHandler)
    if (this.mirrorTimer) clearTimeout(this.mirrorTimer)
    this.assertiveDom?.parentElement?.remove()
  }
}
