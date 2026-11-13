<script lang="ts">
  import { useReporter } from "./utils/reporter.js";
 import {getContext,setContext,onDestroy,untrack} from 'svelte';
 import {numpy as np} from '@hmplot/jax';
 import {DATA_CONTEXT} from './utils/categorical.js';
 import {createDataView} from './utils/dataView.js';
 import Segments from './bound/segments.svelte';
 import type {RoutesProps} from './publicTypes.js';
 let props:RoutesProps=$props();
 const parent:any=getContext(DATA_CONTEXT);
 if(!parent)throw Error('Routes requires an Edges scope.');
 let frame=$state.raw<any>(),error=$state('');
 $effect(()=>{
  const edgeScope=parent.read();const routes=edgeScope.get('routePoints');
  if(!Array.isArray(routes))throw Error('Routes requires DAG routePoints.');
  const rows:number[]=[],start:number[][]=[],end:number[][]=[];
  routes.forEach((points,row)=>{for(let i=1;i<points.length;i++){rows.push(row);start.push(points[i-1]);end.push(points[i]);}});
  const indices=np.array(rows,{dtype:np.int32}),a=np.array(start),b=np.array(end);
  const next=createDataView(edgeScope,{indices,columns:{start:a,end:b}});
  next.onDispose=()=>{indices.dispose();a.dispose();b.dispose();};
  const old=untrack(()=>frame);frame=next;old?.dispose();error='';
 });
 setContext(DATA_CONTEXT,{read(){if(!frame)throw Error(error||'Routes is preparing.');return frame;}});
 onDestroy(()=>frame?.dispose());
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Routes");
  $effect(() => reportError(error));
</script>
{#if frame}<Segments {...props} start="start" end="end"/>{:else if error}<p role="alert">{error}</p>{/if}
