import type { IElement, IElementPosition } from '../../../interface/Element'
import type { IRow } from '../../../interface/Row'
import type { Draw } from '../Draw'
import type { IRenderContext } from '../../render/model/RenderContext'
import { EditorZone, PaperDirection } from '../../../dataset/enum/Editor'

/** Explicit story roots retain their application identities. Dynamic fields
 * are evaluated on ephemeral page layouts, never written into source data. */
export class SectionStories {
  private readonly cache = new Map<string, { elements: IElement[]; rows: IRow[]; positions: IElementPosition[] }>()
  constructor(private draw: Draw, private zone: EditorZone.HEADER | EditorZone.FOOTER,
    private source: () => IElement[]) {}

  public enabled(): boolean { return this.source().some(e => e.storySectionId !== undefined) }
  public clear(): void { this.cache.clear() }
  private owner(page: number, sectionId?: string): string | undefined {
    return sectionId ?? this.draw.getPageRowList()[page]?.[0]?.elementList[0]?.section?.id ??
      this.draw.getMainElementList()[0]?.section?.id
  }
  private layout(page: number, direction: PaperDirection, sectionId?: string) {
    const id = this.owner(page, sectionId)
    const key = JSON.stringify([id, page, direction])
    const known = this.cache.get(key)
    if (known) return known
    const elements = this.source().filter(e => e.storySectionId === id)
      .map(element => ({ ...element, ...(element.pageField === 'pageNumber' ? { value: String(page + 1) } : {}) }))
    const innerWidth = this.draw.getInnerWidth(direction)
    const rows = elements.length ? this.draw.computeRowList({ innerWidth, elementList: elements, isSectionMeasurement: true }) : []
    const options = this.draw.getOptions()
    const header = this.zone === EditorZone.HEADER
    const height = rows.reduce((sum, row) => sum + row.height + (row.offsetY ?? 0), 0)
    const distance = (header ? options.header.top : options.footer.bottom) * options.scale
    const startY = header ? distance : this.draw.getHeight(direction) - distance - height
    const positions: IElementPosition[] = []
    this.draw.getPosition().computePageRowPosition({ positionList: positions,
      rowList: rows, pageNo: page, startRowIndex: 0, startIndex: 0,
      startX: this.draw.getMargins(direction)[3], startY, innerWidth, zone: this.zone })
    const layout = { elements, rows, positions }
    this.cache.set(key, layout)
    return layout
  }
  public elements(): IElement[] { return this.layout(this.draw.getPageNo(), this.draw.getPageDirection(this.draw.getPageNo())).elements }
  public positions(direction: PaperDirection): IElementPosition[] { return this.layout(this.draw.getPageNo(), direction).positions }
  public rows(): IRow[] { return this.layout(this.draw.getPageNo(), this.draw.getPageDirection(this.draw.getPageNo())).rows }
  public height(page = 0, direction = this.draw.getPageDirection(page), sectionId?: string): number {
    return this.layout(page, direction, sectionId).rows.reduce((sum, row) => sum + row.height + (row.offsetY ?? 0), 0)
  }
  public extra(page = 0, direction = this.draw.getPageDirection(page), sectionId?: string): number {
    const height = this.height(page, direction, sectionId)
    if (!height) return 0
    const options = this.draw.getOptions()
    const header = this.zone === EditorZone.HEADER
    return Math.max(0, height + (header ? options.header.top : options.footer.bottom) * options.scale -
      this.draw.getMargins(direction)[header ? 0 : 2])
  }
  public render(ctx: IRenderContext, page: number): void {
    const direction = this.draw.getPageDirection(page)
    const { elements, rows, positions } = this.layout(page, direction)
    const option = this.zone === EditorZone.HEADER ? this.draw.getOptions().header : this.draw.getOptions().footer
    if (option.disabled || option.disabledPages.includes(page)) return
    // An owned story must fit its authored reserved area; never silently clip.
    const boundary = this.zone === EditorZone.HEADER ? this.draw.getMargins(direction)[0] + this.extra(page, direction) :
      this.draw.getHeight(direction) - this.draw.getMargins(direction)[2] - this.extra(page, direction)
    if (positions.some(position => this.zone === EditorZone.HEADER ? position.coordinate.leftBottom[1] > boundary + 1e-6 :
      position.coordinate.leftTop[1] < boundary - 1e-6)) throw new Error('Section story exceeds its reserved area.')
    this.draw.drawRow(ctx, { elementList: elements, positionList: positions, rowList: rows,
      pageNo: page, startIndex: 0, innerWidth: this.draw.getInnerWidth(direction), zone: this.zone })
  }
}
