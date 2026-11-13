<script>
  import { Plot, categorical } from "$lib";
import { Swarm } from "$lib/charts/index.js"; import {untrack} from "svelte";
  let {onready}=$props(),plot=$state(); const groups=["North","South","West"],scale=categorical({domain:groups});
  const data=Array.from({length:300},(_,i)=>({group:groups[i%3],value:(i%3)+Math.sin(i*2.3)*.8}));
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
</script>
<Plot y={{ scale: scale }} bind:this={plot} {data} responsive height={440} axes2d><Swarm x="value" y="group" size={3.5} fill="group" outlineColor="#f4f2ed"/></Plot>
