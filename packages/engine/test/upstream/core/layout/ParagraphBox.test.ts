import { ElementType } from '@/editor/dataset/enum/Element'
import { EDITOR_ELEMENT_COPY_ATTR } from '@/editor/dataset/constant/Element'
import { describe, expect, it } from 'vitest'
import type { IRow } from '@/editor/interface/Row'
import { applyParagraphBoxes } from '@/editor/core/layout/ParagraphBox'

function row(id: string, before = 0, after = 0, height = 20): IRow {
  return {width:20,height:height+after,ascent:15,startIndex:0,rowIndex:0,offsetY:before,spacingAfter:after,
    elementList:[{value:'x',paragraphId:id,paragraphSpacing:'collapse',spacingBefore:before,
      style:'16px serif',metrics:{width:20,height:20,boundingBoxAscent:15,boundingBoxDescent:5}}]}
}
describe('opt-in paragraph box spacing',()=>{
  it.each([[4,12,8],[12,4,0],[0,9,9],[9,0,0]])('collapses after %i / before %i to the larger gap',(after,before,offset)=>{
    const a=row('a',0,after),b=row('b',before)
    applyParagraphBoxes([a,b],1)
    expect(b.offsetY).toBe(offset)
    expect(a.height+(b.offsetY??0)-20).toBe(Math.max(after,before))
  })
  it('reserves outer borders once for a wrapped paragraph',()=>{
    const first=row('a',12,0),last=row('a',0,8),next=row('b',14)
    first.elementList[0].paragraphPresentation={borders:{top:{color:'#123456',width:2,space:6},bottom:{color:'#123456',width:3,space:4}}}
    last.elementList[0].paragraphPresentation=first.elementList[0].paragraphPresentation
    applyParagraphBoxes([first,last,next],2)
    expect(first.offsetY).toBe(28)
    expect(last.height).toBe(42)
    expect(last.paragraphBottom).toBe(14)
    expect(next.offsetY).toBe(6)
  })
  it('never collapses gaps across table or legacy paragraph boundaries',()=>{
    const before=row('a',0,8),table=row('table'),after=row('b',12)
    delete table.elementList[0].paragraphSpacing
    applyParagraphBoxes([before,table,after],1)
    expect(after.offsetY).toBe(12)
    expect(before.height).toBe(28)
  })
  it('does not resurrect hidden review rows or lose visible gap ownership',()=>{
    const before=row('a',0,8),hidden=row('hidden',0,0,0),after=row('b',12)
    applyParagraphBoxes([before,hidden,after],1)
    expect(hidden.height).toBe(0)
    expect(after.offsetY).toBe(4)
  })
  it('rejects non-finite and negative border space',()=>{
    for(const space of [NaN,Infinity,-1]){
      const item=row('a');item.elementList[0].paragraphPresentation={borders:{top:{color:'#123456',width:2,space}}}
      expect(()=>applyParagraphBoxes([item],1)).toThrow('Invalid paragraph border geometry')
    }
  })
})

it('does not allocate a phantom line for an owned empty terminator after a nested table',()=>{
  const table=row('table');table.elementList[0].type=ElementType.TABLE
  const terminal=row('terminal',12,8);terminal.elementList[0].value='\u200b';terminal.elementList[0].cellTerminal=true
  applyParagraphBoxes([table,terminal],1,true)
  expect(terminal.height).toBe(0);expect(terminal.offsetY).toBe(0);expect(terminal.elementList[0].paragraphId).toBe('terminal')
  expect(EDITOR_ELEMENT_COPY_ATTR).not.toContain('cellTerminal')
  const nonempty=row('terminal');nonempty.elementList[0].cellTerminal=true
  expect(()=>applyParagraphBoxes([table,nonempty],1,true)).toThrow('empty table-cell paragraph')
  expect(()=>applyParagraphBoxes([table,terminal],1,false)).toThrow('empty table-cell paragraph')
  expect(()=>applyParagraphBoxes([terminal],1,true)).toThrow('empty table-cell paragraph')
})
