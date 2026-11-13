import {CanvasTexture,LinearFilter,SRGBColorSpace} from 'three/webgpu';
import {DEFAULT_FONT} from './defaultFont.js';
import {limitError} from './limits.js';
const cache=new Map();
// Host metrics are shared by drawing and automatic bounds. The cache holds no GPU
// resources, is scoped to a document and is bounded even when every row changes text.
const metricDocuments=new WeakMap();
const METRIC_ENTRIES=64,METRIC_BYTES=256*1024;
let fontRevision=0;
function fontState() {
  const owner=document;
  let state=metricDocuments.get(owner);
  if(!state){state={entries:new Map(),bytes:0,fonts:null,signature:null,revision:++fontRevision,listeners:new Set(),notify:false};metricDocuments.set(owner,state);}
  const fonts=owner.fonts;
  const invalidate=()=>{
    state.entries.clear();state.bytes=0;state.revision=++fontRevision;
    if(!state.notify){state.notify=true;queueMicrotask(()=>{state.notify=false;for(const listener of state.listeners)listener(state.revision);});}
  };
  if(fonts!==state.fonts){
    for(const event of ['loading','loadingdone','loadingerror'])state.fonts?.removeEventListener?.(event,state.onFonts);
    state.fonts=fonts;state.onFonts=invalidate;state.signature=null;invalidate();
    for(const event of ['loading','loadingdone','loadingerror'])fonts?.addEventListener?.(event,state.onFonts);
  }
  // A loaded FontFace may be added without a loading event. Compare face identity
  // and descriptors too, so replacing a face at the same set size also invalidates.
  const signature=[fonts?.status,fonts?.size];
  if(fonts?.[Symbol.iterator])for(const face of fonts)signature.push(face,face.status,face.family,face.style,face.weight,face.stretch,face.unicodeRange,face.variationSettings,face.featureSettings);
  if(!state.signature||signature.length!==state.signature.length||signature.some((value,i)=>value!==state.signature[i])){
    state.signature=signature;invalidate();
  }
  return state;
}
/** Internal revision for Text payloads; font loading also invalidates host metrics. */
export const labelFontRevision=()=>fontState().revision;
/** Font loading and footprint checks notify payload owners, including loaded-face replacement. */
export function onLabelFontChange(listener){const state=fontState();state.listeners.add(listener);return()=>state.listeners.delete(listener);}
/** Measure with the same font and units as the texture; empty labels reserve no ink. */
export function measureLabelWidths(labels,font=DEFAULT_FONT) {
  const state=fontState(),strings=labels.map(String),key=JSON.stringify([font,strings]);
  const cached=state.fonts?.status==='loading'?undefined:state.entries.get(key);
  if(cached){state.entries.delete(key);state.entries.set(key,cached);return cached.widths.slice();}
  const context=document.createElement('canvas').getContext('2d');context.font=`64px ${font}`;
  const widths=strings.map(s=>s.length?context.measureText(s).width:0),bytes=key.length*2+widths.length*8;
  if(state.fonts?.status!=='loading'&&bytes<=METRIC_BYTES){
    while(state.entries.size>=METRIC_ENTRIES||state.bytes+bytes>METRIC_BYTES){
      const oldest=state.entries.keys().next().value;state.bytes-=state.entries.get(oldest).bytes;state.entries.delete(oldest);
    }
    state.entries.set(key,{widths:widths.slice(),bytes});state.bytes+=bytes;
  }
  return widths;
}
/** The texels (at 64 px a font size) between a label's text and its atlas cell's edges: 4, and
 * 16 in an atlas a halo (TODO 134.29) draws from, room for it within the cell. */
export const LABEL_PAD=4,HALO_PAD=16;
/** A leader's default width and the gap it leaves at its point, and a halo's width, in CSS px (TODO 134.29). */
export const LEADER_WIDTH=1.5,LEADER_GAP=3,HALO_WIDTH=2;
/** Host text only; numerical coordinates never leave the GPU. */
export function labelAtlas(labels,limit=8192,font=DEFAULT_FONT,pad=LABEL_PAD) {
  const key=JSON.stringify([labels,font,limit,pad,labelFontRevision()]);
  let entry=cache.get(key);
  if(!entry){
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    ctx.font=`64px ${font}`;
    const widths=measureLabelWidths(labels,font);
    const cellWidth=Math.ceil(Math.max(1,...widths))+2*pad,cellHeight=80+2*pad;
    const columns=Math.max(1,Math.min(Math.floor(limit/cellWidth),Math.ceil(Math.sqrt(Math.max(1,labels.length)*cellHeight/cellWidth))));
    const rows=Math.max(1,Math.ceil(labels.length/columns));
    if(cellWidth>limit||rows*cellHeight>limit)throw limitError('texture',{component:'Text',what:'its label atlas',count:Math.max(cellWidth,rows*cellHeight),limit,hint:'Use fewer distinct labels, or shorter ones.'});
    canvas.width=columns*cellWidth;canvas.height=rows*cellHeight;
    ctx.font=`64px ${font}`;ctx.fillStyle='white';ctx.textBaseline='middle';
    labels.forEach((s,i)=>ctx.fillText(String(s),i%columns*cellWidth+pad,Math.floor(i/columns)*cellHeight+cellHeight/2));
    const texture=new CanvasTexture(canvas);texture.minFilter=LinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.colorSpace=SRGBColorSpace;
    entry={texture,columns,rows,cellWidth,cellHeight,pad,widths,users:0};cache.set(key,entry);
  }
  entry.users++;let released=false;
  return {...entry,release(){if(released)return;released=true;if(!--entry.users){cache.delete(key);entry.texture.dispose();}}};
}
