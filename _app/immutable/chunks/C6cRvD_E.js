const n=`<script>
  import { onMount, onDestroy } from "svelte";
  import { numpy as np } from "@hmplot/jax";
  import { Plot, Line, Heatmap, Legend, Area,  initializePlot } from "$lib";
import { ErrorBars } from "$lib/charts/index.js";
  let { onready = () => {} } = $props();
  let ready = $state(false),
    plot = $state(),
    densityPlot = $state(),
    line = $state(),
    band = $state(),
    map = $state(),
    error = $state(""),
    width = $state(800),
    host;
  let constantDensity = $state(false);
  let selected = $state(-1),
    axis = $state("y"),
    quantized = $state(false),
    view = $state("2d"),
    painted = $state(false);
  let arrays = [];
  let values = $state.raw();
  onMount(() => {
    let active = true;
    const observer = new ResizeObserver(([e]) => (width = e.contentRect.width));
    observer.observe(host);
    initializePlot()
      .then(() => {
        if (!active) return;
        const x = np.linspace(-3, 3, 81),
          y = np.sin(x.ref),
          lower = y.ref.sub(0.3),
          upper = y.ref.add(0.3),
          position = np.stack([x.ref, y.ref], 1);
        const ex = np.linspace(-2.5, 2.5, 9),
          ey = np.sin(ex.ref),
          observations = np.stack([ex.ref, ey.ref], 1),
          elo = ey.ref.sub(0.5),
          ehi = ey.ref.add(0.5);
        const xlo = ex.ref.sub(0.25),
          xhi = ex.ref.add(0.25);
        const gx = np.linspace(-2, 2, 32),
          grid = np
            .exp(
              np
                .square(gx.ref.reshape([32, 1]))
                .add(np.square(gx.ref.reshape([1, 32])))
                .neg(),
            )
            .mul(10);
        const constantGrid = np.full([32, 32], 5).astype(np.float32);
        arrays = [
          constantGrid,
          x,
          y,
          lower,
          upper,
          position,
          ex,
          ey,
          observations,
          elo,
          ehi,
          gx,
          grid,
          xlo,
          xhi,
        ];
        values = {
          x,
          y,
          lower,
          upper,
          position,
          observations,
          elo,
          ehi,
          grid,
          constantGrid,
          ex,
          xlo,
          xhi,
        };
        ready = true;
      })
      .catch((e) => (error = e.message));
    return () => {
      active = false;
      observer.disconnect();
    };
  });
  $effect(() => onready(plot));
  $effect(() => {
    if (import.meta.env.DEV) {
      window.__guideExample = { plot, densityPlot, map, line, band };
      return () => delete window.__guideExample;
    }
  });
  onDestroy(() => {
    Promise.all([plot?.whenSettled(), densityPlot?.whenSettled()]).finally(() =>
      arrays.forEach((a) => a.dispose()),
    );
    onready(undefined);
  });
<\/script>

<div bind:this={host}>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if ready}
    <div class="controls">
      <label
        ><input type="checkbox" bind:checked={constantDensity} /> Constant density</label
      >
      <label
        >Error direction <select aria-label="Error direction" bind:value={axis}
          ><option value="y">Y</option><option value="x">X</option></select
        ></label
      ><label
        ><input type="checkbox" bind:checked={quantized} /> Quantized colors</label
      ><label
        >Surface view <select aria-label="Surface view" bind:value={view}
          ><option value="2d">2D</option><option value="3d">3D</option></select
        ></label
      ><label
        ><input type="checkbox" bind:checked={painted} /> Paint interval on surface</label
      >
    </div>
    <Plot x={{ domain: [-3, 3] }} y={{ domain: [-2, 2] }}
      bind:this={plot}
      {width}
      height={320}
      axes2d
      legend
      overview
      toneMapping={0}
      settings={{ showTrigger: false }}
    >
      <Area x={values.x} upper={values.y} fill="#83a99a" label="Area" />
      <Area opacity={0.2}
        bind:this={band}
        x={values.x}
        lower={values.lower}
        upper={values.upper}
        fill="#547ba2"
        label="95% interval"
      />
      <Line
        bind:this={line}
        position={values.position}
        color="#315878"
        width={2}
        label="Estimate"
      />
      <ErrorBars
        position={values.observations}
        lower={axis === "x" ? values.xlo : values.elo}
        upper={axis === "x" ? values.xhi : values.ehi}
        {axis}
        capSize={6}
        label="Uncertainty"
        onclick={(e) => (selected = e.instanceId)}
      />
    </Plot>
    {#if selected >= 0}<output aria-label="Selected observation"
        >Observation {selected + 1}</output
      >{/if}
    <p class="label">Selected-series legend, placed outside the plot</p>
    <Legend for={[line, band]} />
    <Plot x={{ domain: [-3, 3] }}
      bind:this={densityPlot}
      type={view}
      {width}
      height={220}
      toneMapping={0}
      axes2d
    >
      {#if painted}<Heatmap
          bind:this={map}
          fill={constantDensity ? values.constantGrid : values.grid}
          surfaceMode={view === "3d"}
          zScale={15}
          quantize={quantized}
          label="Density"
        >
          <Area
            x={values.x}
            lower={values.lower}
            upper={values.upper}
            fill="#f4f2ed"
            opacity={0.6}
          />
        </Heatmap>{:else}<Heatmap
          bind:this={map}
          fill={constantDensity ? values.constantGrid : values.grid}
          surfaceMode={view === "3d"}
          zScale={15}
          quantize={quantized}
          label="Density"
        />{/if}
      <Legend for={map} channel="fill" label="Density" position="right" />
    </Plot>
  {/if}
</div>

<style>
  .controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font: 12px system-ui;
    margin: 12px 0;
  }
  .controls label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .label {
    font: 11px system-ui;
    color: #687782;
    margin: 12px 0 4px;
  }
</style>
`;export{n as default};
