<script>
  // TODO 136.18: one mark family at one row count (?kind=Points&n=1025), rows generated on the
  // GPU (Data rows= with row() and random()), for the nightly scale sweep (scale-sweep.spec.js).
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Data, Plot, Calculate, Points, Line, Segments, Rect, Area, Text, row, random, divide, add, floor } from "$lib/index";
  const kind = page.url.searchParams.get("kind") ?? "Points", n = Number(page.url.searchParams.get("n") ?? 1000);
  let plot = $state();
  onMount(() => {
    window.scaleSweep = { get plot() { return plot; }, kind, n };
    return () => { delete window.scaleSweep; };
  });
  const columns = {
    x: divide(row(), Math.max(1, n)),
    y: random({ seed: 7 }),
    series: floor(divide(row(), 1000)),
  };
</script>

<Data rows={n}>
  <Calculate {columns}>
    <Calculate columns={{ x1: add("x", 0.002), y1: add("y", 0.01) }}>
      <Plot bind:this={plot} width={400} height={260} animation={false} x={{ domain: [-0.05, 1.05] }} y={{ domain: [-0.1, 1.1] }}>
        {#if kind === "Points"}<Points x="x" y="y" size={3} fill="#2a6f97" />
        {:else if kind === "Line"}<Line x="x" y="y" series="series" color="#2a6f97" />
        {:else if kind === "Segments"}<Segments start={["x", "y"]} end={["x1", "y1"]} color="#2a6f97" />
        {:else if kind === "Rect"}<Rect x0="x" x1="x1" y0="y" y1="y1" fill="#2a6f97" />
        {:else if kind === "Area"}<Area x="x" lower={0} upper="y" series="series" fill="#2a6f97" />
        {:else if kind === "Text"}<Text x="x" y="y" text="•" color="#2a6f97" />
        {/if}
      </Plot>
    </Calculate>
  </Calculate>
</Data>
