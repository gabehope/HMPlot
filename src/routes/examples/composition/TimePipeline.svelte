<script>
  import { Plot, Calculate, Filter, Rect, Points, tween, less, divide, col } from "$lib";
import { Bin } from "$lib/stats/index.js";
  let { onready = () => {} } = $props();
  let plot = $state(), step = $state(0);
  const n = 400;
  // Deterministic draws: one bump, then two, then one again.
  function draws(seed) {
    let state = seed * 7919 + 1;
    const random = () => ((state = (state * 48271) % 2147483647) / 2147483647);
    const normal = () => Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random());
    const value = Float32Array.from({ length: n }, (_, i) => {
      const center = seed % 2 === 0 ? 0.35 : i % 2 ? 0.25 : 0.72;
      return Math.min(0.999, Math.max(0, center + normal() * 0.08));
    });
    return { value, order: Float32Array.from({ length: n }, (_, i) => i), lane: Float32Array.from({ length: n }, () => -2 - 6 * random()) };
  }
  const rows = $derived(draws(step));
  const edges = Array.from({ length: 41 }, (_, i) => i / 40);
  $effect(() => onready(plot));
</script>

<p>
  <code>tween("value")</code> is a column whose values move: the histogram re-bins its rows as they
  glide to new values, and the points below follow them. A Filter on <code>@time</code> lets the
  points in, 100 per second of the view clock.
</p>
<button onclick={() => step++}>New values</button>
<button onclick={() => plot?.setAnimationTime(0, { freeze: false })}>Replay the reveal</button>
<Plot bind:this={plot} data={rows} responsive height={340} axes2d x={{ domain: [0, 1] }} y={{ domain: [-9, 60] }}>
  <Calculate columns={{ v: tween("value", { duration: 1200 }) }}>
    <!-- Explicit edges: the Bin re-runs on every frame of the glide without reading extents back. -->
    <Bin x="v" bins={edges}>
      <Rect x0="x0" x1="x1" y0={0} y1="count" fill="#4c78a8" />
    </Bin>
    <Filter where={less("order", divide("@time", 10))}>
      <Points x="v" y="lane" size={1.5} fill="#e45756" />
    </Filter>
  </Calculate>
</Plot>

<style>
  p { font-size: 14px; line-height: 1.5; }
</style>
