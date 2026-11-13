<script>
  import { untrack } from "svelte";
  import { Plot, Frame, Facet, Points, Line, Legend, connect, categorical } from "$lib";
  let {onready = () => {}} = $props();
  let plot = $state(), facet = $state(), lines = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // Sixty penguins, three species, four measurements (deterministic).
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const species = ["Adelie", "Chinstrap", "Gentoo"];
  const centers = { bill_length: [38.8, 48.8, 47.5], bill_depth: [18.3, 18.4, 15.0], flipper: [190, 196, 217], mass: [3700, 3730, 5080] };
  const spreads = { bill_length: [2.7, 3.3, 3.1], bill_depth: [1.2, 1.1, 1.0], flipper: [6.5, 7.1, 6.5], mass: [460, 380, 500] };
  const rows = Array.from({ length: 60 }, (_, i) => {
    const group = i % 3, row = { id: i, species: species[group] };
    Object.keys(centers).forEach((field, k) => {
      const gauss = (noise(i, k * 3 + 1) + noise(i, k * 3 + 2) + noise(i, k * 3 + 3) - 1.5) * 2;
      row[field] = Math.round((centers[field][group] + gauss * spreads[field][group]) * 10) / 10;
    });
    return row;
  });
  const colors = categorical({ domain: species, range: ["#e07b39", "#7b5ea7", "#2a9d8f"] });
  const data = Object.fromEntries(Object.keys(rows[0]).map((key) => [key, rows.map((row) => row[key])]));
</script>
<p>Parallel coordinates from connections: an embedded <code>Facet</code> with <code>fields</code> makes one cell per measurement, in which <code>value</code> is that measurement, and each measurement keeps its own y scale, titled by the measurement. A <code>Frame</code> in every cell sets x from 0 to 1 and keeps the cell's y, so the points at x = 0 sit on the cell's axis. Every cell shows the same penguins, so the points repeated in the cells match by observation: one <code>Line</code> outside the Facet connects them in facet order and takes its color from the shared table. Shift-drag on a measurement's axis to brush it; brushes on several axes combine, and the other penguins fade.</p>
<Plot bind:this={plot} {data} responsive height={420} axes2d={false}>
  <Facet bind:this={facet} fields={["bill_length", "bill_depth", "flipper", "mass"]}>
    <!-- x runs from 0 to 1 across the cell (hidden); y is the cell's measurement. -->
    <Frame x={{ domain: [0, 1], visible: false }}>
      <Points name="values" x={0} y="value" size={2.5} fill="#5d6773" brush={{ axis: "y" }} />
    </Frame>
  </Facet>
  <Line bind:this={lines} connections={connect(facet?.endpoint("values"))}
    color="species" colorScale={colors} width={1.5} opacity={0.7} respond="brushed" />
  <Legend for={lines} channel="color" label="Species" position="right" />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
