// Reference-only helpers. Never included in agent guidance or evaluation sandboxes.
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
export async function parquet(url) {
  const response=await fetch(url);
  if (!response.ok) throw Error(`Could not load reference dataset: ${response.status}`);
  return parquetReadObjects({file:await response.arrayBuffer(),compressors});
}
export function columns(rows) {
  return Object.fromEntries(Object.keys(rows[0]??{}).map(key=>[key,
    typeof rows[0][key]==='number'?Float64Array.from(rows,row=>row[key]):rows.map(row=>row[key])
  ]));
}
/** Native overview gesture; the visible selection is drawn with HMPlot Rect. */
export function rangeBrush(node, config) {
  let start=null;
  function value(event) {
    const plot=config.plot(),canvas=node.querySelector('.canvas');
    if (!plot || !canvas) return null;
    const box=canvas.getBoundingClientRect(),point=plot.getScreenMapping()?.unproject({x:event.clientX-box.left,y:event.clientY-box.top});
    return point?Math.max(config.min,Math.min(config.max,Math.floor(point.x))):null;
  }
  const down=event=>{if(event.button!==0)return;start=value(event);if(start===null)return;node.setPointerCapture(event.pointerId);event.preventDefault();config.change([start,start]);};
  const move=event=>{if(start===null)return;const end=value(event);if(end!==null)config.change([Math.min(start,end),Math.max(start,end)]);};
  const up=()=>start=null;
  node.addEventListener('pointerdown',down);node.addEventListener('pointermove',move);node.addEventListener('pointerup',up);node.addEventListener('pointercancel',up);
  return {update(next){config=next;},destroy(){node.removeEventListener('pointerdown',down);node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',up);node.removeEventListener('pointercancel',up);}};
}
/** Explicit reference-test hook: public handles only, no application debug state. */
export function expose(name, handle) {
  if (!handle) return;
  window.referencePlots ??= {};
  window.referencePlots[name]=handle;
  return ()=>{if(window.referencePlots?.[name]===handle)delete window.referencePlots[name];};
}
