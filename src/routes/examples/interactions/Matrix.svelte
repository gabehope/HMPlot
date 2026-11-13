<script>
  import {Data, Facet, Plot, Points, where} from "$lib";
  let {onready = () => {}} = $props();
  const count = 256;
  const records = Array.from({length: count}, (_, i) => ({
    id: `row-${i}`, group: ["A", "B", "C", "D"][i % 4],
    x: 0.08 + 0.84 * ((i * 37) % 997) / 996,
    y: 0.5 + 0.38 * Math.sin(i * 0.71),
    score: 0.5 + 0.4 * Math.cos(i * 0.29),
    response: 0.5 + 0.38 * Math.sin(i * 0.17 + 1)
  }));
  let facet = $state(), cacheSize = $state(64);
  $effect(() => {onready(facet);return () => onready(undefined);});
</script>
<p>The same observation appears in all 16 cells. Brushes add shared column constraints, while X navigation links each matrix column and Y navigation links each row.</p>
<label class="controls">Offscreen cache <select bind:value={cacheSize}><option value={0}>0 (remount)</option><option value={64}>64 (retain)</option></select></label>
<Data value={records} key="id">
  <Facet bind:this={facet} pairs={['x','y','score','response']} scales="field" link="grid" {cacheSize}>
    <Plot height={260} axes2d>
      <Points x="x" y="y" fill="group" size={where('@hovered',11,5)}
        hover select brush respond={['hovered','selected','brushed']} />
    </Plot>
  </Facet>
</Data>
<style>
  .controls {display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0}
  p {font-size:14px;line-height:1.5} select {font:inherit}
</style>
