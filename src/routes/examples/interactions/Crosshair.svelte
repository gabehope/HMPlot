<script>
  import { untrack } from "svelte";
  import { Data, Plot, Line, Text } from "$lib";
import { RuleX, RuleY, Crosshair } from "$lib/charts/index.js";
  let { onready = () => {} } = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // A made-up daily load, and a second table of events, one rule each.
  const T0 = Date.UTC(2026, 0, 1), DAY = 86400000;
  const noise = (i) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const series = { date: [], load: [] };
  for (let i = 0, level = 60; i < 120; i++) {
    level += (noise(i) - 0.5) * 4 + (i >= 33 && i < 45 ? 1.2 : 0) - (i >= 76 && i < 80 ? 3 : 0);
    series.date.push(new Date(T0 + i * DAY));
    series.load.push(Math.round(level * 10) / 10);
  }
  const events = { date: [new Date(T0 + 33 * DAY), new Date(T0 + 76 * DAY)], name: ["Release", "Outage"] };
</script>

<p>
  Move the pointer over the plot: the crosshair follows it, with a readout of each value at the
  frame's edges. The dashed rule marks a threshold, and each gray rule an event from a second table,
  labeled at the top of the frame (<code>y="@view_y_max"</code>). Rules never widen the axes.
</p>
<Plot bind:this={plot} data={series} responsive height={340} axes2d y={{ label: "load (%)" }}>
  <Line x="date" y="load" color="#547ba2" width={2} />
  <RuleY y={75} color="#cf8955" dash />
  <Data value={events}>
    <RuleX x="date" color="#8a949e" />
    <Text x="date" y="@view_y_max" text="name" dx={4} dy={10} align="left" legend={false} />
  </Data>
  <Crosshair />
</Plot>

<style>
  p { font-size: 14px; line-height: 1.5; }
</style>
