<script>
  import { untrack } from "svelte";
  import { Data, Plot, Points, where } from "$lib";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  const records = Array.from({length: 600}, (_, i) => ({
    id: i, group: ["A", "B", "C"][i % 3],
    x: 50 + 40 * Math.sin(i * 0.37) * Math.cos(i * 0.011),
    y: 50 + 40 * Math.cos(i * 0.23),
    score: (i * 71) % 100, response: 50 + 35 * Math.sin(i * 0.05),
  }));
</script>
<p>Shift-drag in either plot to brush, or click to select. The other rows shrink only while a brush or selection exists: <code>@any_brushed</code> and <code>@any_selected</code> are 1 on every row while anything is brushed or selected, and 0 otherwise. Click empty space or press Escape to clear, and every row returns to its normal size.</p>
<div class="plots">
  <Data value={records} key="id">
    <section><h3>Brush here</h3>
      <Plot bind:this={plot} responsive height={340} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
        <Points x="x" y="y" fill="group" brush select
          size={where("@any_brushed", where("@brushed", 4.5, 1), 3)} />
      </Plot>
    </section>
    <section><h3>…or here</h3>
      <Plot responsive height={340} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
        <Points x="score" y="response" fill="group" brush select
          size={where("@any_selected", where("@selected", 7, 1.5), where("@any_brushed", where("@brushed", 4.5, 1), 3))} />
      </Plot>
    </section>
  </Data>
</div>
<style>
  .plots {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}
  section {min-width:0} h3 {font-size:14px;font-weight:500} p {font-size:14px;line-height:1.5}
</style>
