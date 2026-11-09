import {CommandAdapt} from '@/editor/core/command/CommandAdapt'
import {EditorZone} from '@/editor/dataset/enum/Editor'
import { afterEach, describe, expect, it } from 'vitest'
import { Draw } from '@/editor/core/draw/Draw'
import { EventBus } from '@/editor/core/event/eventbus/EventBus'
import { Listener } from '@/editor/core/listener/Listener'
import { Override } from '@/editor/core/override/Override'
import { ElementType } from '@/editor/dataset/enum/Element'
import type { IElement } from '@/editor/interface/Element'
import type { IEditorData } from '@/editor/interface/Editor'
import { formatElementList } from '@/editor/utils/element'
import { mergeOption } from '@/editor/utils/option'
const draws: Draw[] = []
const band = (id: string, count = 2, start: 'continuous' | 'nextPage' = 'continuous') => ({id, start, columns: {count, gap: 20}})
function render(data: IEditorData, scale = 1) {
  const options = mergeOption({width: 320, height: 240, margins: [30, 20, 30, 20], scale,
    preserveLeadingParagraph: true, defaultRowMargin: 0, defaultBasicRowMarginHeight: 0,
    table: {tdPadding: [4, 6, 4, 6], defaultTrMinHeight: 0},
    header: {disabled: false, top: 10}, footer: {disabled: false, bottom: 10}})
  for (const elements of [data.main, data.header ?? [], data.footer ?? []]) formatElementList(elements, {editorOptions: options, isForceCompensation: true})
  const host = document.createElement('div'); document.body.append(host)
  const draw = new Draw(host, options, data, new Listener(), new EventBus(), new Override())
  draws.push(draw); draw.render({isLazy: false}); return draw
}
afterEach(() => {for (const draw of draws.splice(0)) draw.destroy(); document.body.replaceChildren()})
describe('section-owned module content', () => {
  it.each([.5, 1, 2])('retains tables across columns then resumes full-width content at scale %s', scale => {
    const a = band('body'), b = band('wide', 1)
    const table: IElement = {id: 'reference', type: ElementType.TABLE, value: '', section: a, colgroup: [{width: 130}],
      trList: Array.from({length: 15}, (_, i) => ({id: `row-${i}`, height: 40, keepTogether: true,
        tdList: [{id: `cell-${i}`, colspan: 1, rowspan: 1, value: [{id: `p-${i}`, value: '\nrow '+i, widowControl: true}]}]}))}
    const draw = render({main: [{value: '\nHeading', keepWithNext: true, section: a}, table,
      {value: '\nWide ending', section: b}], header: [], footer: []}, scale)
    const fragments = draw.getRowList().filter(row => row.tableFragment)
    expect(fragments.length).toBeGreaterThan(1)
    expect(fragments[0].tableFragment?.startTrIndex).toBe(0)
    expect(fragments.at(-1)?.tableFragment?.endTrIndex).toBe(15)
    for (let i = 1; i < fragments.length; i++) expect(fragments[i].tableFragment?.startTrIndex).toBe(fragments[i-1].tableFragment?.endTrIndex)
    for (const row of draw.getRowList()) {
      const p = row.sectionPlacement; expect(p).toBeDefined()
      expect((p?.y ?? 0) + row.height + (row.offsetY ?? 0)).toBeLessThanOrEqual(210 * scale + 1e-5)
    }
    const saved = draw.getValue().data.main.filter(element => element.type === ElementType.TABLE)
    expect(saved).toHaveLength(1); expect(saved[0].trList).toHaveLength(15)
    expect(draw.getRowList().at(-1)?.sectionPlacement?.width).toBe(280 * scale)
  })
  it('uses page-owned stories and evaluates fields without literalizing the source', () => {
    const data: IEditorData = {main: [{value: '\nCover', section: band('cover',1)},
      {value: '\nBody', section: band('body',1,'nextPage')}],
      header: [{id:'body-header', value:'\nBody header', storySectionId:'body'}],
      footer: [{id:'body-footer',value:'\nPage ',storySectionId:'body'},
        {id:'page-field',value:'',pageField:'pageNumber',storySectionId:'body'}]}
    const draw = render(data)
    expect(draw.getPageRowList()).toHaveLength(2)
    expect(draw.getHeader().getExtraHeight(0)).toBe(0)
    draw.setPageNo(1)
    expect(draw.getHeader().getElementList().map(e=>e.value).join('')).toBe('\u0000Body header')
    expect(draw.getFooter().getElementList().find(e=>e.id==='page-field')?.value).toBe('2')
    const field = draw.getValue({extraPickAttrs:['id']}).data.footer?.find(e=>e.id==='page-field')
    expect(field?.value).toBe(''); expect(field?.pageField).toBe('pageNumber')
    draw.setPageNo(0); expect(draw.getHeader().getElementList()).toHaveLength(0)
  })
  it('keeps hard line breaks in one paragraph without repeating before spacing', () => {
    const section=band('text',1)
    const draw=render({main:[{value:'\nFirst',section,paragraphId:'p',spacingBefore:10},
      {value:'\n',hardBreak:true,section,paragraphId:'p',spacingBefore:10},
      {value:'Second',section,paragraphId:'p',spacingBefore:10}],header:[],footer:[]})
    const rows=draw.getRowList(); expect(rows).toHaveLength(2)
    expect(rows[0].offsetY).toBe(10);expect(rows[1].offsetY).toBe(0)
    expect(draw.getValue().data.main.some(e=>e.hardBreak)).toBe(true)
  })
})

it('restores input focus only after a valid noncollapsed range, without changing its selection or source',()=>{
  const draw=render({main:[{value:'\nText',section:band('body',1)}],header:[],footer:[]})
  const button=document.createElement('button');document.body.append(button);button.focus()
  const command=new CommandAdapt(draw),elements=draw.getOriginalMainElementList()
  const range={zone:EditorZone.MAIN,tablePath:[],startIndex:0,endIndex:2,sourceText:elements.map(element=>element.value).join('')}
  command.restoreRange(range);button.focus();expect(document.activeElement).toBe(button)
  const before=JSON.stringify(draw.getValue())
  expect(()=>command.restoreRange({...range,sourceText:'stale',focus:true})).toThrow()
  expect(document.activeElement).toBe(button)
  command.restoreRange({...range,focus:true})
  expect(document.activeElement?.tagName).toBe('TEXTAREA')
  expect(draw.getRange().getRange()).toMatchObject({startIndex:0,endIndex:2})
  expect(JSON.stringify(draw.getValue())).toBe(before)
})

it.each([.5,1,2])('keeps a feasible table row after an illustration on the next full page at scale %s',scale=>{
  const a=band('illustration',1),b=band('prose',2)
  const draw=render({main:[{value:'\nIllustration',section:a,lineHeight:{rule:'exact',value:140}},
    {value:'\n',section:b,hide:true},{id:'kept',value:'',type:ElementType.TABLE,section:b,colgroup:[{width:130}],
      trList:[{id:'kept-row',height:100,minHeight:100,keepTogether:true,tdList:[{colspan:1,rowspan:1,value:[{value:'\nKept text'}]}]}]}],header:[],footer:[]},scale)
  const table=draw.getRowList().filter(row=>row.elementList[0]?.id==='kept')
  expect(table).toHaveLength(1);expect(table[0].tableFragment).toBeUndefined()
  expect(table[0].sectionPlacement).toMatchObject({pageNo:1,y:30*scale})
})

it.each([-1,NaN,Infinity,500])('rejects invalid or impossible section leading space %s',leadingSpace=>{
  expect(()=>render({main:[{value:'\nText',section:{...band('body'),leadingSpace}}],header:[],footer:[]})).toThrow(/section|Section/)
})
