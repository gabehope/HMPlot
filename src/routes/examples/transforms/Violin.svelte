<script>
  import { Plot, categorical } from "$lib";
import { Violin } from "$lib/charts/index.js"; import {untrack} from "svelte";
  let {onready}=$props(),plot=$state(); const groups=["Alpha","Beta","Gamma"],scale=categorical({domain:groups});
  const data=Array.from({length:240},(_,i)=>({group:groups[i%3],value:(i%3)*1.2+Math.sin(i*2.17)*.7+Math.cos(i*.31)*.25}));
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
</script>
<Plot x={{ scale: scale }} bind:this={plot} {data} responsive height={440} axes2d><Violin x="group" y="value" fill="group" outlineColor="#30343b"/></Plot>
