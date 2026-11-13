<script>
  // The former root "Plot studio" playground (the docs home replaced it in 35aedbe), kept as a
  // fixture for plot.spec.js and axes.spec.js: one Plot, a mark picker, generated data, and
  // `window.__plotTest`.
  import { onMount } from "svelte";
  import { random, numpy as np } from "@hmplot/jax";
  import { T } from "@threlte/core";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  import Plot from "$lib/plot/plot.svelte";
  import Heatmap from "$lib/plot/marks/heatmap.svelte";
  import Points from "$lib/plot/marks/scatterPoints.svelte";
  import Points3D from "$lib/plot/marks/scatter3d.svelte";
  import ScatterSprite from "$lib/plot/marks/scatterPoints.svelte";
  import Segments from "$lib/plot/marks/segments.svelte";
  import Line from "$lib/plot/marks/line.svelte";
  import Surface from "$lib/plot/marks/surface.svelte";
  import Arrows3D from "$lib/plot/marks/arrows.svelte";
  import Text3D from "$lib/plot/marks/text.svelte";
  import { disposeArrays } from "$lib/plot/utils/data.js";
  let plot;
  onMount(() => {
    if (import.meta.env.DEV)
      window.__plotTest = {
        getDiagnostics: () => plot.getDiagnostics(),
        whenSettled: () => plot.whenSettled(),
      };
    return () => {
      delete window.__plotTest;
    };
  });
  let initialized = $state(false),
    generated = $state(false),
    numPoints = $state(10000),
    size = $state(25),
    color = $state("#5366dc");
  let scenetype = $state("2d"),
    marktype = $state("2d");
  let data = $state.raw({});
  onMount(() => {
    let active = true;
    initializePlot().then(
      () => {
        if (active) initialized = true;
      },
      () => {},
    );
    return () => {
      active = false;
    };
  });
  $effect(() => {
    if (!initialized || !generated) return;
    const points = numPoints
      ? random.normal(random.key(34), [numPoints, 3]).mul(0.5)
      : undefined;
    const ends = numPoints ? np.zeros([numPoints, 3]) : undefined;
    const fill = numPoints
      ? random.uniform(random.key(42), [numPoints, 1])
      : undefined;
    const [x, y] = np.meshgrid([
      np.linspace(-3, 3, 64),
      np.linspace(-3, 3, 64),
    ]);
    const height = np.sin(x).mul(np.cos(y));
    data = { points, ends, fill, height };
    return () => disposeArrays({ points, ends, fill, height });
  });
  const curveStart = [
      [-0.8, -0.6, 0],
      [-0.8, -0.2, 0],
      [-0.8, 0.2, 0],
    ],
    curveEnd = [
      [0.8, -0.6, 0],
      [0.8, -0.2, 0],
      [0.8, 0.2, 0],
    ],
    curveControl = [
      [-0.5, 0.8, 0],
      [-0.5, 0.8, 0.4],
      [-0.5, 0.9, 0],
    ];
</script>

<svelte:head><title>Plot playground fixture</title><link rel="icon" href="data:," /></svelte:head>
<main>
  <h1>Plot playground fixture</h1>
  <Plot
    bind:this={plot}
    name="Main plot"
    bind:type={scenetype}
    height={680}
    responsive
  >
    <T.DirectionalLight position={[30, 40, 60]} intensity={2} /><T.AmbientLight
      intensity={0.7}
    />
    {#if marktype === "surface"}<Surface
        name="Height surface"
        height={data.height}
        lit
      />
    {:else if marktype === "links"}<Segments
        name="Curved links"
        start={curveStart}
        end={curveEnd}
        control1={curveControl}
        {color}
        width={0.15}
      />
    {:else if marktype === "arrows"}<Arrows3D
        name="Arrows3D"
        start={curveStart}
        end={curveEnd}
        {color}
      />
    {:else if marktype === "text"}<Text3D
        name="Text label"
        text="Hello, geometry"
        size={6}
        {color}
        billboard
      />
    {:else if marktype === "tex"}<Text3D tex
        name="Equation"
        text={"\\frac{1}{x^2+1}"}
        size={8}
        {color}
        billboard
      />
    {:else}
      {#if generated}<Heatmap
          name="Heatmap"
          fill={data.height}
          zrange={[-30, -20]}
        />{/if}
      {#if marktype === "2d"}<Points
          name="Points 2D"
          position={data.points}
          {size}
          fill={color}
        />
      {:else if marktype === "3d"}<Points3D
          name="Points 3D"
          position={data.points}
          size={size / 25}
          fill={data.fill ?? color}
          lit
        />
      {:else if marktype === "sprite"}<ScatterSprite
          name="Sprites"
          position={data.points}
          {size}
          fill={color}
        />
      {:else if marktype === "segments"}<Segments
          name="Segments"
          start={data.points}
          end={data.ends}
          width={size / 100}
          color={data.fill ?? color}
        />
      {:else if marktype === "line"}<Line
          name="Connected line"
          position={data.points}
          width={size / 100}
          color={data.fill ?? color}
        />{/if}
    {/if}
    {#snippet toolbar()}
      <div class="toolbar">
        <button onclick={() => (generated = true)} disabled={!initialized}
          >Generate data</button
        >
        <label
          >Mark<select aria-label="Mark" bind:value={marktype}
            >{#each [["2d", "Points 2D"], ["3d", "Points 3D"], ["sprite", "Sprites"], ["segments", "Segments"], ["line", "Connected line"], ["links", "Curved links"], ["surface", "Surface"], ["arrows", "Arrows3D"], ["text", "Text3D"], ["tex", "TeX"]] as [value, label]}<option
                {value}>{label}</option
              >{/each}</select
          ></label
        >
        <label
          >Points <span>{numPoints.toLocaleString()}</span><input
            aria-label="Point count"
            type="range"
            min="0"
            max="250000"
            step="100"
            bind:value={numPoints}
          /></label
        >
        <label
          >Size<input
            aria-label="Size"
            type="range"
            min="1"
            max="100"
            bind:value={size}
          /></label
        >
        <label
          >Color<input
            aria-label="Color"
            type="color"
            bind:value={color}
          /></label
        >
      </div>
    {/snippet}
  </Plot>
</main>

<style>
  main { max-width: 1400px; margin: auto; padding: 16px; font-family: system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; padding: 12px; }
  label { font-size: 11px; display: grid; gap: 5px; }
</style>
