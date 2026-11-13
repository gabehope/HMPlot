<script lang="ts">
 import GraphTransform from './graphTransform.svelte';
 import type {TreemapProps} from './publicTypes.js';
 let props:TreemapProps=$props();
 let child=$state<any>();
 export const whenSettled=()=>child?.whenSettled();
 export const subscribe=(listener:(status:import('./publicTypes.js').TransformStatus)=>void)=>child.subscribe(listener);
</script>
<GraphTransform bind:this={child} kind="Treemap" {...props}/>
