<script lang="ts">
 import Uncertainty from './uncertainty.svelte';
 import type {FlowProps} from '../publicTypes.js';
 let props:FlowProps=$props();
 let mark=$state<any>();
 export const getLegendSource=()=>mark?.getLegendSource();
 export const getMark=()=>mark?.getMark();
</script>
<Uncertainty bind:this={mark} kind="flow" {...props}/>
