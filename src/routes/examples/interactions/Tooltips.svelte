<script>
  import { onMount, untrack } from "svelte";
  import { Plot, Points, where } from "$lib";
import { Histogram } from "$lib/charts/index.js";
  let { onready = () => {} } = $props();
  let scatter = $state(), histogram = $state();
  $effect(() => { if (scatter) untrack(() => onready(scatter)); });
  // A made-up penguin sample: small points, so the tooltip finds the nearest one within 16 pixels.
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const species = ["Adelie", "Chinstrap", "Gentoo"], islands = ["Biscoe", "Dream", "Torgersen"];
  const n = 330;
  const penguins = { species: [], island: [], bill: [], mass: [] };
  for (let i = 0; i < n; i++) {
    const s = i % 3;
    penguins.species.push(species[s]);
    penguins.island.push(islands[Math.floor(noise(i, 1) * 3)]);
    penguins.bill.push(Math.round((38 + s * 5 + (noise(i, 2) - 0.5) * 7) * 10) / 10);
    penguins.mass.push(Math.round(3500 + s * 700 + (noise(i, 3) - 0.5) * 900));
  }
  onMount(() => {
    if (!import.meta.env.DEV) return;
    const exposed = { penguins, get scatter() { return scatter; }, get histogram() { return histogram; } };
    window.__tooltipsExample = exposed;
    return () => { if (window.__tooltipsExample === exposed) delete window.__tooltipsExample; };
  });
</script>

<p>
  Point near a penguin: the tooltip shows the nearest one within 16 pixels, so small points are easy
  to reach, and <code>@tooltip</code> enlarges it. The first plot lists chosen fields with a label
  and a format; the histogram's bars show their bin and count.
</p>
<div class="views">
  <Plot bind:this={scatter} data={penguins} responsive height={320} axes2d x={{ label: "bill length (mm)" }} y={{ label: "body mass (g)" }}>
    <Points x="bill" y="mass" fill="species" size={where("@tooltip", 5, 2.5)}
      tooltip={["island", "bill", { field: "mass", label: "body mass (g)", format: ",.0f" }]} />
  </Plot>
  <Plot bind:this={histogram} data={penguins} responsive height={320} axes2d tooltip>
    <Histogram x="mass" bins={20} fill="#547ba2" />
  </Plot>
</div>

<style>
  p { font-size: 14px; line-height: 1.5; }
  .views { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 12px; }
</style>
