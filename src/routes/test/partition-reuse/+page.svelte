<script>
  // TODO 17.9 fixture: a Partition over data whose updates touch one group's rows. The other
  // groups keep their views, so the Density under them does not run again.
  import { onMount } from "svelte";
  import { Data, Plot, Partition, Density, Line, Points, Filter } from "$lib/index";
  // ?scene=filter: the Partition under a Filter on x (TODO 29.12).
  const scene = typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("scene");
  let threshold = $state(100);
  const species = ["Adelie", "Chinstrap", "Gentoo"], n = 60;
  let table = $state({
    species: Array.from({ length: n }, (_, i) => species[i % 3]),
    x: Float32Array.from({ length: n }, (_, i) => (i % 3) * 5 + Math.sin(i) * 2),
    y: Float32Array.from({ length: n }, (_, i) => Math.cos(i)),
  });
  let partition = $state(), plot = $state();
  onMount(() => {
    window.partitionReuse = {
      get partition() { return partition; }, get plot() { return plot; },
      /** Change Gentoo's x in place: a new x column, the other columns kept. */
      gentoo(shift) { table = { ...table, x: Float32Array.from(table.x, (v, i) => (table.species[i] === "Gentoo" ? v + shift : v)) }; },
      /** Append a Gentoo row: every column new, the old rows' values unchanged. */
      append() { table = { species: [...table.species, "Gentoo"], x: Float32Array.from([...table.x, 12]), y: Float32Array.from([...table.y, 0.5]) }; },
      /** Shift every row. */
      replace() { table = { ...table, x: Float32Array.from(table.x, (v) => v + 1) }; },
      /** The Filter's bound (scene=filter): x below it is kept. */
      setThreshold(value) { threshold = value; },
      async settle() { await partition?.whenSettled?.(); await plot?.whenSettled?.(); },
    };
    return () => { delete window.partitionReuse; };
  });
</script>

{#if scene === "filter"}
  <Data value={table}>
    <Plot bind:this={plot} width={420} height={280} axes2d toneMapping={0}>
      <Filter where={{ field: "x", op: "lt", value: threshold }}>
        <Partition bind:this={partition} by="species">
          <Points x="x" y="y" size={3} />
          <Density x="x" resolution={32}><Line x="x" y="density" width={2} /></Density>
        </Partition>
      </Filter>
    </Plot>
  </Data>
{:else}
  <Data value={table}>
    <Plot bind:this={plot} width={420} height={280} axes2d toneMapping={0}>
      <Partition bind:this={partition} by="species">
        <Points x="x" y="y" size={3} select />
        <Density x="x" resolution={32}><Line x="x" y="density" width={2} /></Density>
      </Partition>
    </Plot>
  </Data>
{/if}
