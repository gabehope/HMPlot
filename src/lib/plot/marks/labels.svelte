<script>
  import { useViewServices } from "../utils/viewServices.js";
 import {markComponent} from '../utils/markComponent.svelte.js';
 import {T,useThrelte} from '@threlte/core';
 import {untrack} from 'svelte';
 import {ensureScatter2DOptions} from '../objects/defaultOptions.js';
 import {SelectType} from '../objects/types.js';
 import {Labels} from '../objects/labels.js';
 import {createLabelPayload} from '../utils/labelPayload.js';
 import {onLabelFontChange,LABEL_PAD,HALO_PAD} from '../utils/labelAtlas.js';
 import {haloColor} from '../utils/axisColors.js';
 import {DEFAULT_FONT,withGenericFamily} from '../utils/defaultFont.js';
 import {updateFields,shapeOf} from '../utils/data.js';
 import { trackPreparation } from '../rendering/viewSettlement.js';
import { settleUploads } from '../rendering/uploadSettlement.js';
 import {getOptionsContext} from '../utils/context.js';
 import {Vector3} from 'three/webgpu';
 import {framePoint} from '../utils/framePlacement.js';
 import {spreadOffsets} from '../utils/labelSpread.js';
 let {position,text='',size=12,color='#30343b',categoryColor,dx=0,dy=0,align='center',font=DEFAULT_FONT,box=undefined,leader=undefined,_halo=false,_spread=false,name,_interactionOpacity=undefined,...others}=$props();
 const {renderer,invalidate,camera}=useThrelte();
 const viewServices = useViewServices();
 let lease,leaseSource,version=0,fontRevision=$state(0);
 const payload=createLabelPayload();
 const count=$derived(shapeOf(position)[0]??0);
 const stack=$derived(withGenericFamily(font));
 // A changing position with the same row count leaves this derived payload untouched.
 const textPayload=$derived.by(()=>{
  fontRevision;
  // Keep validation failures inside the mark's publication/error boundary. Throwing
  // from a derived value would instead unmount its enclosing Scene or example.
  try{return {source:payload.prepare(text,count,stack,renderer.backend?.device?.limits?.maxTextureDimension2D??8192,_halo?HALO_PAD:LABEL_PAD)};}
  catch(error){return {error};}
 });
 const component=markComponent('Text',{
  name:()=>name,
  setup:(parent)=>{ensureScatter2DOptions(parent);parent.ensure('align',new SelectType({defaultValue:'center',options:['left','center','right','auto']}));},
  create:(local)=>new Labels(local, viewServices, invalidate),
  display:()=>['align','opacity','visible'],
  populate:()=>({...others,align}),
  handlers:()=>others,
  // A preparation still in flight gives up its atlas; the one shown is released.
  cleanup:()=>{version++;lease?.release();payload.dispose();},
 });
 const {mark}=component;
 // Labels spread apart along y where they would overlap (EndLabels, TODO 136.16): each row's dy
 // moves it from its point by the least that clears its neighbours, from the shown rows' places
 // on the screen (read after a frame draws new rows or new row opacity: a few rows, once each),
 // placed again after each frame (the view moved, resized or fit). Rows a Filter hides (opacity
 // 0) take no room.
 const SPREAD_ROWS=512;
 let spreadView=$state(0),spreadRows=$state.raw(null),spreadDy=$state.raw(null),spreadKey=null;
 const readSpread=()=>{
  // The camera a frame drew with (a fit after the rows arrived moves it without a camera event).
  spreadView++;
  const at=mark.fields.get('position')?.lastRequest?.data,shown=mark.fields.get('interactionOpacity')?.lastRequest?.data??null;
  if(!at?.ref||(at===spreadKey?.at&&shown===spreadKey?.shown))return;
  spreadKey={at,shown};
  const rows=at.shape?.[0]??0,width=at.shape?.[1]??2;
  if(rows<2||rows>SPREAD_ROWS){spreadRows=null;return;}
  let points,visible;
  try{points=at.ref.data();visible=shown?.ref?shown.ref.data():null;}catch{return;}
  trackPreparation(viewServices,Promise.all([points,visible]).then(([data,opacity])=>{
   if(spreadKey?.at!==at||spreadKey?.shown!==shown)return;
   spreadRows=Array.from({length:rows},(_,i)=>opacity&&!(opacity[i]>0)?null:[data[width*i],data[width*i+1],width>2?data[width*i+2]:0]);
  }).catch(()=>{}));
 };
 $effect(()=>{
  if(!_spread||!viewServices)return;
  const callbacks=viewServices.lifecycle.frameCallbacks;
  callbacks.add(readSpread);
  return()=>callbacks.delete(readSpread);
 });
 $effect(()=>{
  spreadView;
  // A dy column keeps its rows' own offsets: only a constant dy is spread around.
  const rows=typeof dy==='number'?spreadRows:null,base=typeof dy==='number'?dy:0,px=typeof size==='number'?size:12;
  const view=camera.current,height=renderer.domElement?.clientHeight||0;
  if(!rows||!view||!height){if(untrack(()=>spreadDy))spreadDy=null;return;}
  view.updateMatrixWorld();
  const at=new Vector3();
  const ys=rows.map(p=>{if(!p)return NaN;at.fromArray(framePoint(component.local,p)).project(view);return(1-at.y)/2*height;});
  const next=Float32Array.from(spreadOffsets(ys,px*1.2),(offset)=>base+offset);
  // The same offsets keep the same array: writing them again would draw, and a draw reads again.
  const previous=untrack(()=>spreadDy);
  if(!previous||previous.length!==next.length||next.some((v,i)=>Math.abs(v-previous[i])>0.01))spreadDy=next;
 });
 $effect(()=>onLabelFontChange(revision=>{fontRevision=revision;}));
 $effect(()=>{
  const id=++version,result=textPayload;let next,changed=false;
  try{
   if(result.error)throw result.error;
   const source=result.source;
   changed=source!==leaseSource;
   next=changed?source.retain():lease;
   const old=lease;
   trackPreparation(viewServices,Promise.resolve(updateFields(mark,{position,size,fill:color,dx,dy:spreadDy??dy,textCode:next.codes,textWidth:next.widths,...(_interactionOpacity===undefined?{}:{interactionOpacity:_interactionOpacity}),...(categoryColor===undefined?{}:{categoryColor})})).then(()=>{
    if(id!==version){if(changed)next.release();return;}
    if(changed){lease=next;leaseSource=source;
     mark.exportLabels=next.labels.slice();mark.exportFont=stack;mark.exportWidths=next.atlas.widths.map(w=>w/64);
    }
    // A new atlas only swaps the texture and its uniform; the material is built on the first atlas and when the color source changes.
    const colored=categoryColor!==undefined,rebuild=mark.setAtlas(next.atlas)||mark.categoryColorActive!==colored;mark.categoryColorActive=colored;if(rebuild)mark.build();component.report();invalidate();if(changed&&old)settleUploads(viewServices).then(()=>old.release());
   }).catch(e=>{if(changed)next.release();if(id===version)component.report(e);}));
  }catch(e){if(changed)next?.release();component.report(e);}
 });
 // A box behind each label, and a leader line from its point to the box (TODO 46): true for
 // the defaults, or their settings.
 const setting=(value)=>value===true?{}:value&&typeof value==='object'?value:null;
 $effect(()=>{const rebuild=mark.setBox(setting(box));if(mark.setLeader(setting(leader))||rebuild)mark.build();invalidate();});
 // A halo of the plot's background (Callout's, TODO 134.29), none on a transparent one. Only a
 // mark with a halo reads the plot's options.
 const scope=getOptionsContext();
 let background=$state();
 $effect(()=>{
  if(!_halo){background=undefined;return;}
  let style;try{style=scope?.child?.('plot');}catch{return;}
  background=style?.get?.('background');
  return style?.on?.(()=>{background=style.get('background');},'background');
 });
 $effect(()=>{if(mark.setHalo(_halo?haloColor(background):null))mark.build();invalidate();});
 export const getLegendSource=()=>mark.guideHandle;
 export const getMark=()=>mark;
</script>
<T is={mark} {...component.events}/>
