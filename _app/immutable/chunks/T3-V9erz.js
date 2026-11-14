const e=`<script>
  import { untrack } from "svelte";
  import { Plot, Data, Density, Filter, Calculate, Area, Line, Text, continuous, add, subtract, multiply, greater } from "$lib";
import { RuleY } from "$lib/charts/index.js";
  import weather from "./lincoln-temperature-2016.json";

  let { onready = () => {} } = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });

  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const data = {
    month: weather.month,
    temperature: weather.meanF.map((value) => (value - 32) / 1.8),
  };
  const labels = { month: months, baseline: months.map((_, i) => 11 - i) };
  const temperatureColor = continuous({
    domain: [-23, 30],
    colormap: {
      colors: ["#0493cf", "#52a7db", "#a2cbe1", "#ffffe0", "#ffc173", "#ff7f26", "#f50000"],
      positions: [-23, -16, -8, 0, 10, 20, 30].map((value) => (value + 23) / 53),
      space: "srgb",
    },
  });
  // A density of 0.06 reaches the next month's baseline. Sharing one frame
  // lets larger peaks overlap instead of clipping them to separate facet cells.
  const columns = {
    baseline: subtract(11, "month"),
    ridge: add(subtract(11, "month"), multiply("density", 1 / 0.06)),
  };
  // SveltePlot uses an Epanechnikov kernel of width 4. HMPlot's Gaussian
  // standard deviation below gives the same kernel variance, for a close shape.
  const bandwidth = 4 / Math.sqrt(5);
<\/script>

<p>Daily mean temperatures in Lincoln, Nebraska, in 2016. Adapted from
  <a href="https://svelteplot.dev/examples/area/ridgeline">SveltePlot's ridgeline example</a>,
  based on Austin Wehrwein's chart. Each month gets a density curve; temperature controls
  the blue-to-red fill.</p>

<Plot bind:this={plot} {data} responsive height={600} axes2d axisFrame={false}
  description="Twelve temperature distributions, January at the top through December at the bottom."
  x={{ domain: [-26, 33], label: "Mean temperature (°C)", step: 10, grid: "off", titlePosition: "end", arrow: "none" }}
  y={{ domain: [-0.05, 12.6], visible: false }}>
  <Data value={labels}>
    <RuleY y="baseline" color="#64748b" opacity={0.5} width={0.6} />
  </Data>
  <Density x="temperature" by="month" {bandwidth} resolution={256} bounds={{ x: [-26, 33] }}>
    <Filter where={greater("density", 0.0002)}>
      <Calculate {columns}>
        <Area x="x" upper="ridge" lower="baseline" series="month"
          fill="x" fillScale={temperatureColor} opacity={0.75} blend="multiply" />
        <Line x="x" y="ridge" series="month" color="#334155" width={1.2} />
      </Calculate>
    </Filter>
  </Density>
  <Data value={labels}>
    <Text x={-25.8} y={add("baseline", 0.4)} text="month" align="left" size={14} color="#334155" />
  </Data>
</Plot>

<style>p { font-size: 14px; line-height: 1.5; }</style>
`;export{e as default};
