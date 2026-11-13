<script>
  import { Plot, Line, Points, Rect, sum } from "$lib";
import { Bin } from "$lib/stats/index.js";
  import { onMount, untrack } from "svelte";
  let { onready } = $props(), plot = $state();
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
  // Half-hourly prices for four weeks of trading, 09:30 to 16:00 in New York (a random walk).
  const t = [], price = [], volume = [];
  let value = 100, seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let day = 0; day < 28; day++) {
    const date = new Date(Date.UTC(2026, 2, 2 + day));
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const offset = date >= new Date(Date.UTC(2026, 2, 8)) ? 4 : 5; // EDT from March 8
    for (let minute = 570; minute <= 960; minute += 30) {
      value += random() * 1.6;
      t.push(new Date(date.getTime() + (minute + offset * 60) * 60000));
      price.push(value);
      volume.push(1000 + Math.round((random() + 0.5) * 3000));
    }
  }
  const data = { t, price, volume };
  onMount(() => {
    if (!import.meta.env.DEV) return;
    const exposed = { t, price };
    window.__marketHours = exposed;
    return () => { if (window.__marketHours === exposed) delete window.__marketHours; };
  });
  const zone = "America/New_York";
</script>

<p>
  A price every half hour of four weeks of trading. The axis leaves out weekends and the hours
  outside the 09:30 to 16:00 session in New York (<code>breaks</code>), so the line runs on from
  one session's close to the next one's open. Shift-drag to brush across a break. Below, the
  daily volume, binned by calendar day in the same zone.
</p>
<Plot bind:this={plot} {data} responsive height={260} axes2d
  x={{ timezone: zone, breaks: ["weekends", { hours: [16, 9.5] }] }}>
  <Line x="t" y="price" color="#9aa7b4" width={1} />
  <Points x="t" y="price" size={2} fill="#2f6fa3" brush respond="brushed" />
</Plot>
<Plot {data} responsive height={150} axes2d x={{ timezone: zone, breaks: ["weekends"] }}>
  <Bin x="t" interval="1 day" tz={zone} columns={{ shares: sum("volume") }}>
    <Rect x0="x0" x1="x1" y0={0} y1="shares" fill="#b58a55" />
  </Bin>
</Plot>
