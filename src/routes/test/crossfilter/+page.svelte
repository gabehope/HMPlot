<script>
  import { onMount, onDestroy } from "svelte";
  import { Data, Interaction, Plot, Filter, selection } from "$lib";
  import { Histogram } from "$lib/charts/index.js";

  // Named selections over one table, as in the Python crossfilter evaluation.
  const data = { id: [], x: [], y: [], z: [] };
  for (let i = 0; i < 120; i++) {
    data.id.push(i); data.x.push(i % 12); data.y.push(Math.floor(i / 12)); data.z.push(i % 7);
  }
  const fields = ["x", "y", "z"], brushes = fields.map(() => selection());
  const columns = Object.fromEntries(fields.map((field, i) => [`@${field}_brush`, brushes[i]]));
  let plots = [], histograms = [];
  onMount(() => { window.__crossfilter = { data, brushes, plots, histograms }; });
  onDestroy(() => brushes.forEach((brush) => brush.dispose()));
</script>

<Data value={data} key="id">
  <Interaction {columns}>
    <div style="display:flex;gap:18px">
      {#each fields as field, i}
        <Plot bind:this={plots[i]} title={field} height={320} width={360}>
          <Filter where={fields.filter((_, j) => j !== i).map((f) => `@${f}_brush`)} inactive="all">
            <Histogram bind:this={histograms[i]} x={field} bins={12} brush={{ selection: brushes[i] }} />
          </Filter>
        </Plot>
      {/each}
    </div>
  </Interaction>
</Data>
