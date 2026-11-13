<script lang="ts">
  import { useReporter } from "./utils/reporter.js";
 import {getContext,setContext,onDestroy,untrack} from 'svelte';
 import {numpy as np} from '@hmplot/jax';
 import {DATA_CONTEXT} from './utils/categorical.js';
 import {createDataView} from './utils/dataView.js';
 import FlowMark from './bound/flow.svelte';
 import type {FlowProps} from './publicTypes.js';
 let props:FlowProps=$props();
 const parent:any=getContext(DATA_CONTEXT);
 if(!parent)throw Error('Flow requires an Edges scope.');
 let frame=$state.raw<any>(),error=$state(''),work=Promise.resolve();
 const curve=(start:number[],end:number[],t:number,axis:number)=>{
   const mid=(start[axis]+end[axis])/2;
   const c1=axis===0?[mid,start[1]]:[start[0],mid];
   const c2=axis===0?[mid,end[1]]:[end[0],mid];
   const u=1-t;
   return start.map((v,i)=>u*u*u*v+3*u*u*t*c1[i]+3*u*t*t*c2[i]+t*t*t*end[i]);
 };
 $effect(()=>{
  const scope=parent.read(),channels=[props.startLower,props.endLower,props.startUpper,props.endUpper];
  const abort=new AbortController();
  work=(async()=>{
    const arrays=await Promise.all(channels.map(async field=>{
      const value=scope.resolve(field);return value?.ref?.js?.()??value?.js?.()??value;
    }));
    if(abort.signal.aborted)return;
    const [lo0,lo1,hi0,hi1]=arrays;
    const rows:number[]=[],startLower:number[][]=[],endLower:number[][]=[],startUpper:number[][]=[],endUpper:number[][]=[];
    for(let row=0;row<scope.length;row++){
      const axis=Math.abs(lo1[row][0]-lo0[row][0])>=Math.abs(lo1[row][1]-lo0[row][1])?0:1;
      for(let piece=0;piece<16;piece++){
        const a=piece/16,b=(piece+1)/16;
        rows.push(row);startLower.push(curve(lo0[row],lo1[row],a,axis));endLower.push(curve(lo0[row],lo1[row],b,axis));
        startUpper.push(curve(hi0[row],hi1[row],a,axis));endUpper.push(curve(hi0[row],hi1[row],b,axis));
      }
    }
    const indices=np.array(rows,{dtype:np.int32});
    const columns={startLower:np.array(startLower),endLower:np.array(endLower),startUpper:np.array(startUpper),endUpper:np.array(endUpper)};
    const next=createDataView(scope,{indices,columns});
    next.onDispose=()=>{indices.dispose();Object.values(columns).forEach((value:any)=>value.dispose());};
    if(abort.signal.aborted){next.dispose();return;}
    const old=untrack(()=>frame);frame=next;old?.dispose();error='';
  })().catch(reason=>{if(!abort.signal.aborted)error=reason?.message??String(reason);});
  return()=>abort.abort();
 });
 setContext(DATA_CONTEXT,{read(){if(!frame)throw Error(error||'Flow is preparing.');return frame;}});
 onDestroy(()=>{work.finally(()=>frame?.dispose());});
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Flow");
  $effect(() => reportError(error));
</script>
{#if frame}<FlowMark {...props} startLower="startLower" endLower="endLower" startUpper="startUpper" endUpper="endUpper"/>{:else if error}<p role="alert">{error}</p>{/if}
