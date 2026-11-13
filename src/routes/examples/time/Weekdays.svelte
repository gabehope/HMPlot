<script>
  import { Data, Plot, Line, Calculate, Group, Rect, day_name, mean, sum } from "$lib";
import { Bin } from "$lib/stats/index.js";
import { Bar } from "$lib/charts/index.js";
  import { untrack } from "svelte";
  let { onready } = $props(), plot = $state();
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
  // Daily bike trips over two years: fewer at weekends, more in summer (made up).
  const day = [], trips = [];
  let seed = 5;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = 0; i < 730; i++) {
    const date = new Date(Date.UTC(2025, 0, 1) + i * 86400000), weekend = [0, 6].includes(date.getUTCDay());
    day.push(date);
    trips.push(Math.round(1400 + 500 * Math.sin(((i - 110) / 365) * 2 * Math.PI) - (weekend ? 450 : 0) + random() * 300));
  }
  const data = { day, trips };
</script>

<p>
  Two years of daily bike trips (made up). Below left, the mean day by weekday, grouped by
  <code>day_name(day)</code>, Monday first; below right, the trips of each calendar month, from a
  Bin with <code>interval="1 month"</code>, whose bars start and end at month boundaries.
</p>
<Data value={data}>
<Plot bind:this={plot} responsive height={220} axes2d>
  <Line x="day" y="trips" color="#2f6fa3" width={1} />
</Plot>
<div class="pair">
  <Calculate columns={{ weekday: day_name("day") }}>
    <Group by="weekday" columns={{ mean: mean("trips") }}>
      <Plot responsive height={200} axes2d><Bar x="weekday" y="mean" fill="#6b9c73" /></Plot>
    </Group>
  </Calculate>
  <Bin x="day" interval="1 month" columns={{ total: sum("trips") }}>
    <Plot responsive height={200} axes2d><Rect x0="x0" x1="x1" y0={0} y1="total" fill="#b58a55" /></Plot>
  </Bin>
</div>
</Data>

<style>
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 600px) { .pair { grid-template-columns: 1fr; } }
</style>
