<script>
  // A symlog axis and a diverging color scale for values that cross zero (TODO 39.2).
  import { Plot, Points, Legend, continuous } from "$lib/index";
  let { onready = () => {} } = $props();
  // Illustrative daily net flows: most days move a few units either way, a few tens of
  // thousands. symlog is linear within ±10 and logarithmic beyond.
  const n = 150;
  const flow = Array.from({ length: n }, (_, i) =>
    (i % 3 === 0 ? -1 : 1) * Math.round(10 ** (((i * 37) % 50) / 10) * (0.5 + ((i * 53) % 10) / 20)));
  const data = { day: Array.from({ length: n }, (_, i) => i % 30), flow };
  // The midpoint puts RdBu's white at 0 and uses both ends of the colormap.
  const scale = continuous({ colormap: "RdBu", transform: "symlog", constant: 10, midpoint: 0 });
  let plot = $state(), points = $state();
  $effect(() => { if (plot) onready(plot); });
</script>

<Plot bind:this={plot} {data} responsive height={420} axes2d
  x={{ label: "Day" }} y={{ transform: "symlog", constant: 10, label: "Net flow" }}>
  <Points bind:this={points} x="day" y="flow" fill="flow" fillScale={scale} size={3.5} />
  <Legend for={points} channel="fill" label="Net flow" position="right" />
</Plot>
