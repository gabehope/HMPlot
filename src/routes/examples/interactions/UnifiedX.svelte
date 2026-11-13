<script>
  import { onMount, untrack } from "svelte";
  import { Plot, Line } from "$lib";
import { Crosshair } from "$lib/charts/index.js";
  let { onready = () => {} } = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // Three made-up daily prices.
  const T0 = Date.UTC(2026, 0, 1), DAY = 86400000, tickers = ["North", "East", "West"];
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const prices = { date: [], price: [], ticker: [] };
  tickers.forEach((ticker, k) => {
    for (let i = 0, level = 100 - k * 15; i < 90; i++) {
      level += (noise(i, k) - 0.48) * 3;
      prices.date.push(new Date(T0 + i * DAY));
      prices.price.push(Math.round(level * 100) / 100);
      prices.ticker.push(ticker);
    }
  });
  onMount(() => {
    if (!import.meta.env.DEV) return;
    const exposed = { prices, get plot() { return plot; } };
    window.__unifiedXExample = exposed;
    return () => { if (window.__unifiedXExample === exposed) delete window.__unifiedXExample; };
  });
</script>

<p>
  Move the pointer along the dates: one tooltip lists every series' price at that date, with a marker
  on each line, and <code>{"<Crosshair axes=\"x\" />"}</code> draws the vertical rule.
</p>
<Plot bind:this={plot} data={prices} responsive height={340} axes2d tooltip={{ mode: "x" }} y={{ label: "price" }}>
  <Line x="date" y="price" series="ticker" color="ticker" width={2} />
  <Crosshair axes="x" readout={false} />
</Plot>

<style>
  p { font-size: 14px; line-height: 1.5; }
</style>
