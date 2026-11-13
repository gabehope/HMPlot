<script lang="ts">
 import GraphTransform from './graphTransform.svelte';
 import type {PackProps} from './publicTypes.js';
 let props:PackProps=$props();
 let child=$state<any>();
 export const whenSettled=()=>child?.whenSettled();
 export const subscribe=(listener:(status:import('./publicTypes.js').TransformStatus)=>void)=>child.subscribe(listener);
</script>
<GraphTransform bind:this={child} kind="Pack" {...props}/>
