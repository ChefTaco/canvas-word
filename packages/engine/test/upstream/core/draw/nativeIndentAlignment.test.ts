import {describe,expect,it}from 'vitest'
import {Draw}from '@/editor/core/draw/Draw'
import {EventBus}from '@/editor/core/event/eventbus/EventBus'
import {Listener}from '@/editor/core/listener/Listener'
import {Override}from '@/editor/core/override/Override'
import {ElementType}from '@/editor/dataset/enum/Element'
import {RowFlex}from '@/editor/dataset/enum/Row'
import type {IElement}from '@/editor/interface/Element'
import {formatElementList}from '@/editor/utils/element'
import {mergeOption}from '@/editor/utils/option'

describe('native scalar indent alignment',()=>{
 for(const scale of [.5,1,2])for(const alignment of [RowFlex.CENTER,RowFlex.RIGHT])for(const cell of [false,true])
  it(`uses the reduced right edge at scale ${scale}, ${alignment}, cell=${cell}`,()=>{
   const paragraph:IElement={value:'\n'+'x '.repeat(300),indentLeft:20,indentRight:30,indentFirstLine:-10,rowFlex:alignment}
   const main:IElement[]=cell?[{type:ElementType.TABLE,value:'',colgroup:[{width:160}],trList:[{height:0,tdList:[{colspan:1,rowspan:1,value:[paragraph]}]}]}]:[paragraph]
   const options=mergeOption({width:200,height:1500,margins:[20,20,20,20],scale,defaultFont:'monospace',defaultSize:16,defaultRowMargin:0,defaultBasicRowMarginHeight:0,preserveLeadingParagraph:true,table:{tdPadding:[0,8,0,8]},header:{disabled:true},footer:{disabled:true}})
   const host=document.createElement('div');document.body.append(host);let draw:Draw|undefined
   try{
    formatElementList(main,{editorOptions:options,isForceCompensation:true});draw=new Draw(host,options,{main,header:[],footer:[]},new Listener(),new EventBus(),new Override());draw.render({isLazy:false})
    const tableIndex=draw.getMainElementList().findIndex(element=>element.type===ElementType.TABLE),table=draw.getMainElementList()[tableIndex],td=table?.trList?.[0]?.tdList[0]
    const rows=cell?td?.rowList:draw.getRowList(),positions=cell?td?.positionList:draw.getPosition().getPositionList()
    if(!rows||!positions)throw new Error('Missing native geometry')
    const owned=rows.filter(row=>row.elementList.some(element=>element.indentLeft===20));expect(owned.length).toBeGreaterThan(2)
    const base=cell?(draw.getPosition().getPositionList()[tableIndex]?.coordinate.leftTop[0]??0)+((td?.x??0)+8)*scale:20*scale
    const inner=cell?((td?.width??0)-16)*scale:160*scale
    for(const[index,row]of owned.entries()){
     const left=(index===0?10:20)*scale,available=inner-left-30*scale,position=positions[row.startIndex]
     if(!position)throw new Error('Missing row position')
     expect(row.width).toBeLessThanOrEqual(available+1e-7)
     expect(position.coordinate.leftTop[0]).toBeCloseTo(base+left+(available-row.width)/(alignment===RowFlex.CENTER?2:1),5)
    }
    const serialized=JSON.stringify(draw.getValue());draw.render({isLazy:false});expect(JSON.stringify(draw.getValue())).toBe(serialized)
   }finally{draw?.destroy();host.remove()}
  })
})
