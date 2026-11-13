<script lang="ts">
 import GraphTransform from './graphTransform.svelte';
 import type {DAGProps} from './publicTypes.js';
 let props:DAGProps=$props();
 let child=$state<any>();
 export const whenSettled=()=>child?.whenSettled();
 export const subscribe=(listener:(status:import('./publicTypes.js').TransformStatus)=>void)=>child.subscribe(listener);
</script>
<GraphTransform bind:this={child} kind="DAG" {...props}/>
