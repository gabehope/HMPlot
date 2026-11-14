const e=`<script>
  import { untrack } from "svelte";
  import { Data, Plot, Facet, Points, moved } from "$lib";
  let {onready = () => {}} = $props();
  // Penguin-like measurements (deterministic).
  const species = ["Adelie", "Gentoo", "Chinstrap"];
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    species: species[i % 3],
    bill: 40 + 6 * (i % 3) + 3 * Math.sin(i * 1.7),
    depth: 17 - (i % 3) + Math.cos(i * 2.3),
    mass: 3700 + 700 * (i % 3) + 300 * Math.sin(i * 0.9),
  }));
  let plot = $state(), data = $state(), status = $state("Drag a point.");
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  const signed = (value) => \`\${value > 0 ? "+" : ""}\${value.toFixed(value && Math.abs(value) < 10 ? 2 : 0)}\`;
  const report = (event) => {
    status = event.cancelled ? "Cancelled." : \`Row \${event.keys.join(", ")}: \${Object.entries(event.changes).map(([column, change]) => \`\${column} \${signed(change)}\`).join(", ")}\`;
  };
<\/script>
<p>Drag a point. A drag never changes the table: it writes offsets on its rows, and each cell follows because its positions read <code>moved()</code> of its two fields, so the row moves in every cell that shows the column you dragged along. Select points first (click, Shift-click) to drag them together; Escape cancels.</p>
<p class="status">{status} <button onclick={() => { data?.resetOffsets(); status = "Reset."; }}>Reset</button></p>
<Data bind:this={data} value={rows} key="id">
  <Plot bind:this={plot} responsive height={480} axes2d>
    <Facet pairs={["bill", "depth", "mass"]} triangle="lower">
      <Points x={moved("x")} y={moved("y")} fill="species" size={3.5} select drag ondragend={report} />
    </Facet>
  </Plot>
</Data>
<style>p {font-size:14px;line-height:1.5} .status {font-variant-numeric: tabular-nums}</style>
`;export{e as default};
