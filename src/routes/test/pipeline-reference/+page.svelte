<script>
  // TODO 142: one Filter > Group pipeline, outside every Plot, drawn by two Plots through explicit
  // references (Plot data={grouped} and Data value={grouped}), beside the same pipeline drawn by context.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Data, Plot, Points, Filter, Group, InputContext, count, greater, less } from "$lib/index";
  import { transformRuns } from "$lib/plot/utils/transforms.js";
  const make = (n, shift = 0) => ({
    k: Array.from({ length: n }, (_, i) => ["a", "b", "c", "d"][i % 4]),
    v: Array.from({ length: n }, (_, i) => (i * 7 + shift) % 10),
  });
  let rows = $state.raw(make(40)), threshold = $state(2), showA = $state(true), showB = $state(true), timedSecond = $state(true);
  let grouped = $state(), byContext = $state(), plotA = $state(), plotB = $state(), plotC = $state();
  onMount(() => {
    window.pipelineReference = {
      get grouped() { return grouped; }, get byContext() { return byContext; }, get timed() { return timed; },
      get plots() { return { a: plotA, b: plotB, c: plotC }; },
      runs: () => transformRuns.count,
      setRows: (n, shift) => { rows = make(n, shift); },
      setThreshold: (value) => { threshold = value; },
      show: (a, b) => { showA = a; showB = b; },
      setTimedSecond: (show) => { timedSecond = show; },
    };
    return () => { delete window.pipelineReference; };
  });
  const domain = { y: { domain: [0, 12] } };
  // ?clock: a pipeline reading @time, drawn by reference from two Plots with their own clocks
  // (an error: which clock is unambiguous only in one InputContext), then from two in one.
  const clock = page.url.searchParams.get("clock");
  let timed = $state();
</script>

<Data value={rows}>
  <Filter where={greater("v", threshold)}>
    <Group bind:this={grouped} by="k" columns={{ n: count() }} />
  </Filter>
</Data>
{#if showA && grouped}
  <Plot bind:this={plotA} data={grouped} width={240} height={160} animation={false} {...domain}>
    <Points x="k" y="n" size={10} fill="#2060c0" />
  </Plot>
{/if}
{#if showB}
  <Plot bind:this={plotB} width={240} height={160} animation={false} {...domain}>
    <Data value={grouped}><Points x="k" y="n" size={10} fill="#c03020" /></Data>
  </Plot>
{/if}
<Data value={rows}>
  <Filter where={greater("v", threshold)}>
    <Group bind:this={byContext} by="k" columns={{ n: count() }}>
      <Plot bind:this={plotC} width={240} height={160} animation={false} {...domain}>
        <Points x="k" y="n" size={10} fill="#208040" />
      </Plot>
    </Group>
  </Filter>
</Data>

{#if clock}
  <Data value={rows}>
    <Filter bind:this={timed} where={less("v", "@time")} />
  </Data>
  {#if timed}{#if clock === "shared"}
    <InputContext>
      <Plot data={timed} width={200} height={120} animation={false}><Points x="k" y="v" /></Plot>
      <Plot data={timed} width={200} height={120} animation={false}><Points x="k" y="v" /></Plot>
    </InputContext>
  {:else}
    <Plot data={timed} width={200} height={120} animation={false}><Points x="k" y="v" /></Plot>
    {#if timedSecond}
      <Plot data={timed} width={200} height={120} animation={false}><Points x="k" y="v" /></Plot>
    {/if}
  {/if}{/if}
{/if}
