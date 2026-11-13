<script>
  import {Data, Calculate, Plot, Points, Facet, add, subtract, multiply, divide, square, sqrt, log, exp, clip, where} from "$lib";
  let {onready = () => {}} = $props();
  let count = $state(2000), gain = $state(1), plot = $state();
  const data = $derived.by(() => {
    const x = new Float32Array(count), y = new Float32Array(count), noise = new Float32Array(count);
    for (let i=0; i<count; i++) {
      x[i] = 4 * ((i * 7919 % 104729) / 104729) - 2;
      y[i] = 4 * ((i * 1543 % 104723) / 104723) - 2;
      noise[i] = Math.sin(i * 0.73) * 0.2;
    }
    return {x, y, noise};
  });
  $effect(() => {onready(plot); return () => onready(undefined);});
</script>
<p>Sixteen coordinated views of four calculated fields. Hover, select, and Shift-drag to brush across cells. Counts are per cell; 25,000 rows produces 400,000 plotted instances.</p>
<div class="controls">
  <label>Rows <select bind:value={count}><option value={2000}>2,000</option><option value={10000}>10,000</option><option value={25000}>25,000</option></select></label>
  <label>Gain <input type="range" min="0.25" max="2" step="0.25" bind:value={gain} /> {gain}</label>
</div>
<Data value={data}>
  <!-- Calculate assignments are simultaneous; nest scopes for dependencies. -->
  <Calculate columns={{energy: add(square("x"), square("y")), cross: multiply("x", "y"), shifted: add("x", "noise")}}>
    <Calculate columns={{weight: exp(multiply("energy", -0.5)), logEnergy: log(add("energy", 1)), residual: subtract("shifted", divide("cross", add("energy", 1)))}}>
      <Calculate columns={{score: clip(multiply(multiply("residual", "weight"), gain), -2, 2), magnitude: sqrt(add(square("residual"), 0.01))}}>
      <Facet bind:this={plot} pairs={['shifted','residual','score','logEnergy']} scales="field" link="grid" cacheSize={64}>
        <Plot height={250} axes2d>
          <Points x="x" y="y" fill="score" size={where('@hovered',8,1.5)}
            hover select brush respond={['hovered','selected','brushed']} maxInstances={count} maxElements={count} />
        </Plot>
      </Facet>
      </Calculate>
    </Calculate>
  </Calculate>
</Data>
<style>
  .controls {display:flex;gap:20px;flex-wrap:wrap;margin:12px 0}
  label {display:flex;align-items:center;gap:8px} select,input {font:inherit}
  p {font-size:14px;line-height:1.5}
</style>
