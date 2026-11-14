const e=`<script>
  import {Plot, Points, Text, where} from "$lib";
  let {onready = () => {}} = $props();
  let frame = $state(0), reversed = $state(false), plot = $state();
  const records = $derived.by(() => {
    const rows = Array.from({length:48}, (_, i) => {
      const id = (i + frame * 8) % 80;
      return {id:\`row-\${id}\`, group:['A','B','C','D'][id%4],
        x:0.1+0.8*((id*17)%79)/78,
        y:0.5+0.34*Math.sin(id*0.6+frame*0.12)};
    });
    return reversed ? rows.reverse() : rows;
  });
  $effect(() => {onready(plot);return () => onready(undefined);});
<\/script>
<p>Select a few points, hover, then advance or reverse the rows. Surviving IDs retain selection; removed IDs disappear. Point fades last 500 ms and label fades last 200 ms. No automatic timer runs: every update is explicit. Hover size is immediate unless the configured animation applies.</p>
<div class="controls">
  <button onclick={() => frame++}>Advance</button>
  <button onclick={() => reversed=!reversed}>Reverse row order</button>
  <button onclick={() => {frame=0;reversed=false;}}>Reset data</button>
  <span>Frame {frame}; {reversed ? 'reversed' : 'forward'}</span>
</div>
<Plot bind:this={plot} data={records} key="id" height={480} axes2d x={{domain:[0,1]}} y={{domain:[0,1]}}>
  <Points x="x" y="y" fill="group" size={where('@hovered',12,7)}
    hover select brush respond={['hovered','selected','brushed']}
    animation animationDuration={500} enterEffect="fade" exitEffect="fade" />
  <Text x="x" y="y" text="id" size={10} dy={-17}
    respond={['selected','hovered']} selectionOpacity={0.15}
    animation animationDuration={200} enterEffect="fade" exitEffect="fade" />
</Plot>
<style>
  .controls {display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0}
  p {font-size:14px;line-height:1.5} button {font:inherit}
</style>`;export{e as default};
