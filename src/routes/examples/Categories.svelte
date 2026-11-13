<script>
  import {
    Plot,
    Data,
    Points,
    Line,
    Legend,
    Heatmap,
    Minimap,
    categorical,
    literal,
    initializePlot,
  } from "$lib";
  import { onMount, onDestroy } from "svelte";
  import { numpy as np } from "@hmplot/jax";
  let { onready = () => {} } = $props();
  const colors = categorical({
    domain: ["Control", "A", "B"],
    range: ["#547ba2", "#cf8955", "#7b9865"],
  });
  const shapes = categorical({
    domain: ["Control", "A", "B"],
    range: ["circle", "triangle", "diamond"],
  });
  const groups = categorical({ domain: ["Control", "A", "B"] });
  let rows = $state.raw([
    { group: "Control", value: 1 },
    { group: "A", value: 2 },
    { group: "B", value: 3 },
    { group: "Control", value: 2 },
    { group: "A", value: 3 },
    { group: "B", value: 4 },
  ]);
  let plot = $state(),
    points = $state(),
    line = $state(),
    gpuPlot = $state(),
    gpuPoints = $state(),
    gpu = $state.raw(),
    ready = $state(false),
    selected = $state(-1),
    view = $state("2d"),
    error = $state("");
  let columns = $state(false),
    invalid = $state(false),
    painted = $state(false),
    texturePlot = $state(),
    surfacePoints = $state();
  const table = $derived(
    columns
      ? {
          group: rows.map((r) => r.group),
          value: rows.map((r) => r.value),
          white: rows.map(() => 99),
        }
      : rows,
  );
  let arrays = [];
  onMount(() => {
    let active = true;
    initializePlot()
      .then(() => {
        if (!active) return;
        const codes = np.array([0, 1, 2, 0, 1, 2], { dtype: np.int32 }),
          x = np.arange(6).astype(np.float32),
          y = np.array([1, 3, 2, 4, 3, 5], { dtype: np.float32 });
        arrays = [codes, x, y];
        gpu = { x, y, group: { codes, categories: ["Control", "A", "B"] } };
        ready = true;
      })
      .catch((e) => (error = e.message));
    return () => {
      active = false;
    };
  });
  onDestroy(() => arrays.forEach((a) => a.dispose()));
  $effect(() => {
    if (plot) {
      onready(plot);
      if (import.meta.env.DEV)
        window.__categoryExample = {
          plot,
          points,
          line,
          gpuPlot,
          gpuPoints,
          colors,
          shapes,
          texturePlot,
          surfacePoints,
        };
    }
  });
  function replace() {
    rows = rows.map((r, i) => ({ ...r, value: 1 + ((r.value + i) % 5) }));
  }
</script>

<div class="controls">
  <button onclick={replace}>Update values</button>
  <button onclick={() => (rows = [...rows].reverse())}>Reverse rows</button>
  <label><input type="checkbox" bind:checked={columns} />Column table</label>
  <label
    ><input type="checkbox" bind:checked={invalid} />Invalid replacement</label
  >
  <label
    ><input type="checkbox" bind:checked={painted} />Painted categories</label
  >
  <label
    >View <select aria-label="View" bind:value={view}
      ><option value="2d">2D</option><option value="3d">3D</option></select
    ></label
  >
</div>
{#if error}<p role="alert">{error}</p>{/if}
{#if ready}
  <Plot x={{ scale: groups }} y={{ domain: [0, 6] }}
    bind:this={plot}
    width={820}
    height={360}
    responsive
    type={view}
    axes2d
    axes3d
    overview
    overviewAxes={{ x: true }}
  >
    <Data value={table}>
      <Line
        bind:this={line}
        x="group"
        y={invalid ? "missing" : "value"}
        color="group"
        colorScale={colors}
        width={1}
        label="Observations"
      />
      <Points
        bind:this={points}
        x="group"
        y={invalid ? "missing" : "value"}
        fill="group"
        fillScale={colors}
        shape="group"
        shapeScale={shapes}
        size={12}
        outlineColor={literal("white")}
        outlineWidth={0.7}
        onclick={(e) => (selected = e.instanceId)}
      />
    </Data>
    <Legend for={points} channel="fill" label="Group colors" />
    <Legend for={points} channel="shape" label="Group symbols" />
  </Plot>
  <output>Selected observation: {selected}</output>
  <Legend for={line} channel="color" label="Line groups" />
  <h3>GPU dictionary columns</h3>
  <Plot x={{ domain: [-0.5, 5.5] }} y={{ domain: [0, 6] }}
    bind:this={gpuPlot}
    width={820}
    height={230}
    responsive
    axes2d
  >
    <Data value={gpu}>
      <Points
        bind:this={gpuPoints}
        x="x"
        y="y"
        fill="group"
        fillScale={colors}
        size={10}
      />
    </Data>
    <Legend for={gpuPoints} channel="fill" label="Shared mapping" />
  </Plot>
  {#if painted}
    <h3>Categories painted on a surface</h3>
    <Plot x={{ scale: groups }} y={{ domain: [0, 6] }}
      bind:this={texturePlot}
      width={500}
      height={280}
      type="3d"
    >
      <Heatmap
        fill={[
          [0, 0.3],
          [0.5, 1],
        ]}
        surfaceMode
        zScale={8}
      >
        <Data value={table}
          ><Points
            bind:this={surfacePoints}
            x="group"
            y="value"
            fill="group"
            fillScale={colors}
            shape="group"
            shapeScale={shapes}
            size={22}
            onclick={(e) => (selected = e.instanceId)}
          /></Data
        >
      </Heatmap>
    </Plot>
  {/if}
{/if}

<style>
  .controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    margin: 0 0 12px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  output {
    display: block;
    font: 12px system-ui;
    color: #52606c;
    margin: 8px;
  }
  h3 {
    font: 500 15px system-ui;
    margin-top: 22px;
  }
</style>
