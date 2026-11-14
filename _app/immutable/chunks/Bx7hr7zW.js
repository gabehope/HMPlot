const t=`<script>
  import { Plot, Density, Line, Heatmap, InputContext, Slider, input } from "$lib";
  import { untrack } from "svelte";
  let { onready } = $props(), plot = $state(), mode = $state("1d");
  const data = Array.from({length:240},(_,i)=>({group:i%2?"A":"B",x:Math.sin(i*1.7)*.35+(i%2?1:-1),y:Math.cos(i*.37)*.5}));
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
<\/script>
<InputContext>
<div class="controls"><button onclick={()=>mode=mode==="1d"?"2d":"1d"}>{mode === "1d" ? "Show 2D" : "Show 1D"}</button><Slider name="bandwidth" min={0.02} max={0.5} step={0.01} value={0.15} label="Bandwidth"/></div>
<Plot bind:this={plot} {data} responsive height={440} axes2d>
  {#if mode === "1d"}<Density x="x" by="group" resolution={256} bandwidth={input("bandwidth")}><Line x="x" y="density" color="group" width={2}/></Density>
  {:else}<Density x="x" y="y" resolution={[128,128]} bandwidth={input("bandwidth")}><Heatmap fill="density"/></Density>{/if}
</Plot>
</InputContext>
<style>.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px}button{padding:7px 11px}</style>
`;export{t as default};
