<script>
  import { onMount, onDestroy } from "svelte";
  import {
    Plot,
    Heatmap,
    Image,
    Line,
    Segments,
    Arrows3D,
    Points,
    Minimap,
    initializePlot,
    datetimeCoordinates,
    continuous,
  } from "$lib";
  import { numpy as np } from "@hmplot/jax";
  import { exampleArrays, symbols } from "./catalog.js";
  let { example, onready = () => {} } = $props();
  let data = $state.raw(),
    error = $state(""),
    plot = $state(),
    second = $state();
  let mode = $state("2d"),
    projection = $state("equirectangular"),
    aspect = $state("auto"),
    shape = $state("circle"),
    rotation = $state(0);
  let contours = $state(true),
    pixels = $state(true),
    resolution = $state(1024),
    zone = $state("UTC"),
    zoomAxis = $state("xy");
  let selected = $state("No selection"),
    viewport = $state({ x: 0.5, y: 0.5, zoom: 1, zoomX: 1, zoomY: 1 });
  let container = $state(),
    width = $state(700);
  const canSurface = $derived(
    ["surface", "texture", "sphere"].includes(example.id),
  );
  const origin = Date.UTC(2026, 0, 15, 0);
  const bounds = $derived(
    example.id === "sphere"
      ? { x: [-180, 180], y: [-90, 90] }
      : { x: [-3, 3], y: [-2, 2] },
  );
  const common = $derived({
    aspect,
    x: { domain: bounds.x },
    y: { domain: bounds.y },
    axes2d: mode === "2d",
    toneMapping: 0,
  });
  onMount(() => {
    let alive = true;
    const observer = new ResizeObserver(
      ([entry]) => (width = Math.max(240, Math.floor(entry.contentRect.width))),
    );
    observer.observe(container);
    initializePlot()
      .then(() => {
        if (!alive) return;
        const raw = exampleArrays(),
          owned = {};
        try {
          for (const [key, value] of Object.entries(raw))
            owned[key] = np.array(value);
          const dates = Array.from(
            { length: 49 },
            (_, i) => origin + i * 1800000,
          );
          const relative = datetimeCoordinates(dates, { origin });
          owned.time = np.array(
            Array.from(relative.values, (x, i) => [
              x,
              0.5 + 0.25 * Math.sin(i / 5),
            ]),
          );
          data = owned;
        } catch (e) {
          Object.values(owned).forEach((a) => a.dispose());
          throw e;
        }
      })
      .catch((e) => {
        if (alive) error = e.message;
      });
    return () => {
      alive = false;
      observer.disconnect();
    };
  });
  onDestroy(() => {
    const arrays = data;
    const retire = () =>
      Object.values(arrays ?? {}).forEach((a) => a.dispose());
    Promise.allSettled([plot?.whenSettled(), second?.whenSettled()]).then(
      retire,
    );
    onready(undefined);
  });
  $effect(() => onready(plot));
  function inspect(e) {
    selected = `Point ${e.instanceId + 1}`;
  }
</script>

<div class="controls">
  {#if mode === "2d" && example.id !== "sphere"}
    <label>Aspect ratio
      <select aria-label="Aspect ratio" bind:value={aspect}>
        <option value="auto">Fill plot</option>
        <option value="equal">Preserve proportions</option>
      </select>
    </label>
  {/if}
  {#if canSurface}<label
      >View <select aria-label="View" bind:value={mode}
        ><option value="2d">2D</option><option value="3d">3D</option></select
      ></label
    >{/if}
  {#if example.id === "sphere"}
    <label
      >Projection <select aria-label="Projection" bind:value={projection}
        ><option value="equirectangular">Equirectangular</option><option
          value="mercator">Mercator</option
        ><option value="equal-area">Equal area</option></select
      ></label
    >
  {/if}
  {#if ["texture", "sphere"].includes(example.id)}<label
      >Texture <select aria-label="Texture" bind:value={resolution}
        ><option value={512}>512 × 256</option><option value={1024}
          >1024 × 512</option
        ><option value={2048}>2048 × 1024</option></select
      ></label
    >{/if}
  {#if example.id === "symbols"}
    <label
      >Shape <select aria-label="Shape" bind:value={shape}
        >{#each symbols as symbol}<option value={symbol}>{symbol}</option
          >{/each}</select
      ></label
    >
    <label
      >Rotation <input
        aria-label="Symbol rotation"
        type="range"
        min="0"
        max="180"
        step="5"
        bind:value={rotation}
      /><span>{rotation}°</span></label
    >
  {/if}
  {#if example.id === "surface"}<label
      ><input type="checkbox" bind:checked={contours} />Contours</label
    >{/if}
  {#if example.id === "image"}<label
      ><input type="checkbox" bind:checked={pixels} />Nearest-neighbor pixels</label
    >{/if}
  {#if example.id === "axes"}
    <label
      >Timezone <select aria-label="Timezone" bind:value={zone}
        ><option>UTC</option><option>America/New_York</option><option
          >Asia/Tokyo</option
        ></select
      ></label
    >
    <label
      >Zoom <select aria-label="Zoom" bind:value={zoomAxis}
        ><option value="xy">Both axes</option><option value="x">X only</option
        ><option value="y">Y only</option></select
      ></label
    >
  {/if}
  {#if ["symbols", "texture", "sphere"].includes(example.id)}<output
      aria-live="polite">{selected}</output
    >{/if}
</div>
<div class="plot-host" bind:this={container}>
  {#if error}<div class="placeholder" role="alert">
      <strong>Unable to initialize WebGPU</strong>
      <p>{error}</p>
      <p>Use a WebGPU-capable browser, then reload this page.</p>
    </div>
  {:else if !data}<div class="placeholder" role="status">
      Initializing WebGPU…
    </div>
  {:else if example.id === "linked"}
    <div class="linked">
      <Plot
        bind:this={plot}
        width={width > 640 ? Math.floor((width - 16) / 2) : width}
        height={300}
        type="2d"
        {...common}
        {viewport}
        onviewportchange={(v) => (viewport = v)}
        name="Linked points"
      >
        <Points
          position={data.points}
          size={7}
          fill="#527daa"
          outlineColor="#f8f6f1"
          outlineWidth={0.4}
        />
      </Plot>
      <Plot
        bind:this={second}
        width={width > 640 ? Math.floor((width - 16) / 2) : width}
        height={300}
        type="2d"
        {...common}
        {viewport}
        onviewportchange={(v) => (viewport = v)}
        name="Linked density"
      >
        <Heatmap
          fill={data.density}
          fillScale={continuous({ domain: [0, 1] })}
          zrange={[-1, -1]}
        />
      </Plot>
    </div>
    <div class="overview">
      <Minimap for={plot} width={180} height={110} displayScale={0.35} /><span
        >Drag the overview rectangle. Both plots share the same viewport.</span
      >
    </div>
  {:else if example.id === "axes"}
    <Plot
      x={{ range: [-50 * Math.min(1, width / 430), 50 * Math.min(1, width / 430)], domain: [0, 86400000], label: "Time",
        type: "datetime", origin, timezone: zone, format: "%H:%M", grid: "major-minor", minor: true, minorInterval: { unit: "hour", step: 1 } }}
      y={{ range: [-50 * Math.min(1, 430 / width), 50 * Math.min(1, 430 / width)], domain: [0, 1], label: "Response",
        format: ".0%", grid: "major", minor: true }}
      bind:this={plot}
      {width}
      height={430}
      type="2d"
      name="Datetime axes"
      {aspect}
      toneMapping={0}
      axes2d
      {zoomAxis}
      rules={[
        {
          axis: "y",
          value: 0.5,
          label: "Baseline",
          color: "#8b929c",
          width: 1,
          dash: [5, 4],
        },
      ]}
    >
      <Line
        position={data.time}
        color="#527daa"
        width={2}
      />
    </Plot>
  {:else}
    <Plot
      bind:this={plot}
      {width}
      height={450}
      type={mode}
      {projection}
      {...common}
      x={{ ...common.x, label: example.id === "sphere" ? "Longitude" : "X" }}
      y={{ ...common.y, label: example.id === "sphere" ? "Latitude" : "Y" }}
      coordinates={example.id === "sphere" ? "spherical" : "cartesian"}
      name={example.title}
      axes3d={mode === "3d" && example.id !== "sphere"}
      overview={example.id === "sphere"}
      overviewMaxInstances={1000}
    >
      {#if example.id === "symbols"}
        <Points
          position={data.points}
          {shape}
          {rotation}
          size={12}
          fill="#e9b873"
          outlineColor="#30343b"
          outlineWidth={0.95}
          onclick={inspect}
        />
      {:else if example.id === "paths"}
        <Arrows3D
          start={data.starts}
          end={data.ends}
          color="#b2bcc7"
          width={0.07}
          headWidth={1.2}
          headLength={2}
        />
        <Line
          position={data.curve}
          color="#527daa"
          width={2}
        />
        <Segments
          start={data.segmentStarts}
          end={data.segmentEnds}
          color="#a87852"
          width={1}
          dash={[3, 2]}
        />
      {:else if example.id === "surface"}
        <Heatmap
          fill={data.density}
          fillScale={continuous({ domain: [0, 1] })}
          contour-enabled={contours}
          contour-strength={0.35}
          surfaceMode={true}
          surface3d={mode === "3d"}
          zScale={20}
          detail={96}
          zrange={[0, 0]}
        />
      {:else if example.id === "image"}
        {#key pixels}<Image
            data={data.rgb}
            pixelated={pixels}
          />{/key}
      {:else if example.id === "texture" || example.id === "sphere"}
        <Heatmap
          fill={example.id === "sphere" ? data.globe : data.density}
          fillScale={continuous({ domain: [0, 1] })}
          zrange={[-1, -1]}
          textureResolution={[resolution, resolution / 2]}
          surfaceMode={example.id === "texture"}
          surface3d={mode === "3d"}
          zScale={18}
          lit={false}
        >
          <Line
            position={example.id === "sphere" ? data.route : data.curve}
            width={(2 * resolution) / 1024}
            color="#f4f2ed"
          />
          <Points
            position={example.id === "sphere" ? data.observations : data.points}
            size={((example.id === "sphere" ? 18 : 7) * resolution) / 1024}
            fill="#f4f2ed"
            outlineColor="#30343b"
            outlineWidth={(0.35 * resolution) / 1024}
            onclick={inspect}
          />
        </Heatmap>
      {/if}
    </Plot>
  {/if}
</div>

<style>
  .controls select { font:inherit; border:1px solid #dce1e3; background:white; border-radius:5px; padding:5px 7px; }
  .controls {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    min-height: 44px;
    padding: 0 0 14px;
    font-size: 12px;
    color: #566170;
  }
  label {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  select {
    max-width: 180px;
  }
  input[type="range"] {
    width: 90px;
  }
  output {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .plot-host {
    width: 100%;
    min-height: 430px;
  }
  .placeholder {
    display: grid;
    align-content: center;
    justify-items: center;
    min-height: 430px;
    color: #667180;
    text-align: center;
    padding: 24px;
  }
  .placeholder p {
    max-width: 460px;
  }
  .linked {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .overview {
    display: flex;
    gap: 20px;
    align-items: center;
    padding-top: 18px;
    color: #667180;
    font-size: 12px;
  }
  .overview span {
    max-width: 220px;
  }
</style>
