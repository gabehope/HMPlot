<script>
  import { Plot, categorical } from "$lib";
import { Bar } from "$lib/charts/index.js"; import {untrack} from "svelte";
  let {onready}=$props(),plot=$state(); const data={group:["A","B","C","D"],total:[5,8,4,7]},scale=categorical({domain:data.group});
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
</script>
<Plot x={{ scale: scale }} bind:this={plot} {data} responsive height={420} axes2d><Bar x="group" y="total" fill="group"/></Plot>
