const o=`<script>
  import { Plot, categorical } from "$lib";
import { BoxPlot } from "$lib/charts/index.js"; import {untrack} from "svelte";
  let {onready}=$props(),plot=$state(); const groups=["Control","A","B"],scale=categorical({domain:groups});
  const data=Array.from({length:183},(_,i)=>({group:groups[i%3],value:(i%3)+Math.sin(i*1.93)+(i>177?4:0)}));
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
<\/script>
<Plot x={{ scale: scale }} bind:this={plot} {data} responsive height={440} axes2d><BoxPlot x="group" y="value" fill="group"/></Plot>
`;export{o as default};
