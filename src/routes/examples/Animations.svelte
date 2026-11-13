<script>
  import { onMount, onDestroy, untrack } from "svelte";
  import { numpy as np } from "@hmplot/jax";
  import { Plot, Points, Line, Heatmap, initializePlot, continuous } from "$lib";
  let { example, onready = () => {} } = $props();
  let plot = $state(),
    host = $state(),
    width = $state(800),
    arrays = $state.raw(),
    error = $state("");
  let animation = $state(true),
    duration = $state(700),
    easing = $state("cubic-in-out"),
    height = $state(
      untrack(() => (example.id === "animation-surface" ? 18 : 0.12)),
    ),
    generation = 0,
    alive = true;
  let selected = $state("");
  const mode = $derived(
    example.id === "animation-globe"
      ? "globe"
      : example.id === "animation-surface"
        ? "surface"
        : example.id === "animation-line"
          ? "line"
          : "points",
  );
  const easings = [
    "linear",
    "quad-in",
    "quad-out",
    "quad-in-out",
    "cubic-in",
    "cubic-out",
    "cubic-in-out",
    "sine-in-out",
  ];
  async function target() {
    const phase = ++generation,
      old = arrays;
    const next = {
      surfacePoints: np.array(
        Array.from({ length: 8 }, (_, i) => [
          32 + ((i % 4) - 1.5) * 20 + Math.sin(phase + i) * 5,
          24 + (Math.floor(i / 4) - 0.5) * 25,
        ]),
      ),
      position: np.array(
        Array.from({ length: 120 }, (_, i) => {
          const x = (i / 119) * 6 - 3;
          return [x, Math.sin(x * 1.5 + phase) * (0.4 + (phase % 3) * 0.2)];
        }),
      ),
      color: np.array(
        Array.from(
          { length: 120 },
          (_, i) => (Math.sin(i * 0.05 + phase) + 1) / 2,
        ),
      ),
      size: np.array(
        Array.from(
          { length: 120 },
          (_, i) => 4 + (3 * (Math.sin(i * 0.1 + phase) + 1)) / 2,
        ),
      ),
      density: np.array(
        Array.from({ length: 48 }, (_, y) =>
          Array.from({ length: 96 }, (_, x) => {
            const u = (x / 95) * 6 - 3,
              v = (y / 47) * 4 - 2;
            return Math.exp(
              -((u - Math.sin(phase)) ** 2 + (v - Math.cos(phase) * 0.5) ** 2),
            );
          }),
        ),
      ),
    };
    arrays = next;
    if (old) {
      await plot?.whenSettled();
      Object.values(old).forEach((a) => a.dispose());
    }
  }
  onMount(() => {
    const observer = new ResizeObserver(
      ([e]) => (width = Math.max(1, e.contentRect.width)),
    );
    observer.observe(host);
    initializePlot()
      .then(() => {
        if (alive) target();
      })
      .catch((e) => (error = e.message));
    return () => observer.disconnect();
  });
  $effect(() => onready(plot));
  onDestroy(() => {
    alive = false;
    const old = arrays;
    Promise.resolve(plot?.whenSettled())
      .catch(() => {})
      .finally(() => Object.values(old ?? {}).forEach((a) => a.dispose()));
    onready(undefined);
  });
</script>

{#snippet paintedPoints()}
  <Points
    name="Surface points"
    {animation}
    position={arrays.surfacePoints}
    fill="#f4f2ed"
    outlineColor="#30343b"
    outlineWidth={0.65}
    size={9}
    sizeScale={continuous({ domain: [0, 10], range: [0, 10] })}
    onclick={(event) => (selected = `Point ${event.instanceId + 1}`)}
  />
{/snippet}

<div bind:this={host}>
  <div class="controls">
    <label
      ><input type="checkbox" bind:checked={animation} /> Animated updates</label
    >
    <label
      >Duration <input
        aria-label="Animation duration"
        type="number"
        min="0"
        step="100"
        bind:value={duration}
      /> ms</label
    >
    <label
      >Easing <select aria-label="Animation easing" bind:value={easing}
        >{#each easings as e}<option value={e}>{e}</option>{/each}</select
      ></label
    >
    <button disabled={!arrays} onclick={target}>New target</button>
    {#if mode === "surface" || mode === "globe"}<label
        >Height <input
          aria-label="Animated height"
          type="range"
          min="0"
          max={mode === "globe" ? 0.4 : 35}
          step={mode === "globe" ? 0.01 : 1}
          bind:value={height}
        /></label
      >{/if}
  </div>
  {#if error}<p role="alert">{error}</p>{:else if arrays}
    <Plot x={{ domain: mode === "globe" ? [-180, 180] : [-3, 3] }} y={{ domain: mode === "globe" ? [-90, 90] : [-2, 2] }}
      bind:this={plot}
      {width}
      height={430}
      name={example.title}
      animationDuration={duration}
      animationEasing={easing}
      coordinates={mode === "globe" ? "spherical" : "cartesian"}
      type={mode === "globe" ? "3d-y-up" : mode === "surface" ? "3d" : "2d"}
      overview
      toneMapping={0}
    >
      {#if mode === "points"}
        <Points
          {animation}
          position={arrays.position}
          fill={arrays.color}
          size={arrays.size}
          sizeScale={continuous({ domain: [0, 10], range: [0, 10] })}
          fillScale={continuous({ domain: [0, 1] })}
          outlineColor="#ffffff"
          outlineWidth={0.45}
        />
      {:else if mode === "line"}
        <Line
          {animation}
          position={arrays.position}
          color="#35657b"
          width={2}
        />
      {:else}
        <Heatmap
          {animation}
          fill={arrays.density}
          surfaceMode
          surface3d={mode === "surface"}
          zScale={height}
          detail={96}
          normalization={mode === "surface" ? "auto" : "none"}
          fillScale={continuous({ domain: [0, 1] })}
          lit={false}
          textureResolution={mode === "globe" ? [1024, 512] : undefined}
          children={mode === "globe" ? paintedPoints : undefined}
        />
      {/if}
    </Plot>
  {:else}<p role="status">Initializing WebGPU…</p>{/if}
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin: 16px 0;
    font-size: 12px;
    color: #546270;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  input[type="number"] {
    width: 80px;
  }
  input,
  select,
  button {
    font: inherit;
  }
  select,
  button,
  input[type="number"] {
    border: 1px solid #dce1e3;
    border-radius: 5px;
    background: white;
    padding: 5px 7px;
  }
</style>
