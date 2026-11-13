<script>
  import {Data, Plot, Points, Filter, Text, where} from "$lib";
  let {onready = () => {}} = $props();
  let count = $state(1024), plot = $state(), filteredPlot = $state(), filteredMark = $state();
  $effect(() => {
    window.__interactionDashboard = {source: plot, filteredPlot, filteredMark};
    return () => { delete window.__interactionDashboard; };
  });
  const records = $derived(Array.from({length: count}, (_, i) => ({
    id: `row-${i}`, group: ["A", "B", "C", "D"][i % 4],
    x: 0.08 + 0.84 * ((i * 37) % 997) / 996,
    y: 0.5 + 0.38 * Math.sin(i * 0.71),
    score: 0.5 + 0.4 * Math.cos(i * 0.29),
    response: 0.5 + 0.38 * Math.sin(i * 0.17 + 1)
  })));
  const independent = $derived(records.map(row => ({...row})));
  $effect(() => {onready(plot);return () => onready(undefined);});
</script>
<p>Hover either shared view: the same row enlarges in both. Click/Shift-click selects/toggles; Shift-drag brushes. Drag the brush or click away to clear it. The filtered view updates while brushing. The independent table must not react, even though its IDs and values match.</p>
<label class="controls">Rows <select bind:value={count}><option value={256}>256</option><option value={1024}>1,024</option><option value={4096}>4,096</option></select></label>
<div class="plots">
<Data value={records} key="id">
  <section><h3>Shared rows: position</h3>
    <Plot bind:this={plot} responsive height={340} axes2d x={{domain:[0,1]}} y={{domain:[0,1]}}>
      <Points x="x" y="y" fill="group" size={where('@hovered',11,6)} hover select brush respond={['hovered','selected','brushed']} />
      <Filter where="@hovered" inactive="none"><Text x="x" y="y" text="id" size={12} dy={-16} /></Filter>
    </Plot>
  </section>
  <section><h3>Shared rows: another projection</h3>
    <Plot responsive height={340} axes2d x={{domain:[0,1]}} y={{domain:[0,1]}}>
      <Points x="score" y="response" fill="group" size={where('@hovered',11,6)} hover select brush respond={['hovered','selected','brushed']} />
    </Plot>
  </section>
  <section><h3>Live brush filter (empty until brushing)</h3>
    <Plot bind:this={filteredPlot} responsive height={340} axes2d x={{domain:[0,1]}} y={{domain:[0,1]}}>
      <Filter where="@brushed" inactive="none"><Points bind:this={filteredMark} x="x" y="score" fill="group" size={where('@hovered',11,6)} respond="hovered" /></Filter>
    </Plot>
  </section>
</Data>
<section><h3>Independent table: no coordinated response</h3>
  <Plot data={independent} key="id" responsive height={340} axes2d x={{domain:[0,1]}} y={{domain:[0,1]}}>
    <Points x="x" y="y" fill="group" size={where('@hovered',11,6)} hover select />
  </Plot>
</section>
</div>
<style>
  .plots {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}
  section {min-width:0} h3 {font-size:14px;font-weight:500}
  .controls {display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0}
  p {font-size:14px;line-height:1.5} select {font:inherit}
</style>
