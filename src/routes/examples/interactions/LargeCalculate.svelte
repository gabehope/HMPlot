<script>
  import {Data, Calculate, Plot, Points, Facet, add, subtract, multiply, divide, square, sqrt, log, exp, clip, where} from "$lib";
  let {onready = () => {}} = $props();
  let count = $state(10000), gain = $state(1), plot = $state();
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
<p>Three sequential Calculate scopes share intermediate columns. Change gain to update the final stage; hover, select, and Shift-drag to brush the resulting point cloud. No sampling limit is applied.</p>
<div class="controls">
  <label>Rows <select bind:value={count}><option value={10000}>10,000</option><option value={100000}>100,000</option><option value={250000}>250,000</option></select></label>
  <label>Gain <input type="range" min="0.25" max="2" step="0.25" bind:value={gain} /> {gain}</label>
</div>
<Data value={data}>
  <!-- Calculate assignments are simultaneous; nest scopes for dependencies. -->
  <Calculate columns={{energy: add(square("x"), square("y")), cross: multiply("x", "y"), shifted: add("x", "noise")}}>
    <Calculate columns={{weight: exp(multiply("energy", -0.5)), logEnergy: log(add("energy", 1)), residual: subtract("shifted", divide("cross", add("energy", 1)))}}>
      <Calculate columns={{score: clip(multiply(multiply("residual", "weight"), gain), -2, 2), magnitude: sqrt(add(square("residual"), 0.01))}}>
      <Plot bind:this={plot} height={520} axes2d x={{domain:[-2.3,2.3]}} y={{domain:[-2.3,2.3]}}>
        <Points x="shifted" y="score" fill="magnitude" size={where('@hovered',9,2)}
          hover select brush respond={['hovered','selected','brushed']} maxInstances={count} maxElements={count} />
      </Plot>
      </Calculate>
    </Calculate>
  </Calculate>
</Data>
<style>
  .controls {display:flex;gap:20px;flex-wrap:wrap;margin:12px 0}
  label {display:flex;align-items:center;gap:8px} select,input {font:inherit}
  p {font-size:14px;line-height:1.5}
</style>
