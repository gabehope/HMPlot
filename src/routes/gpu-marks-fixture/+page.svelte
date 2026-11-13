<script>
  import { onMount, tick } from "svelte";
  import { Array as JaxArray, numpy as np, getWebGPUDevice } from "@hmplot/jax";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  import { disposeArrays } from "$lib/plot/utils/data.js";
  import Plot from "$lib/plot/plot.svelte";
  import Arrows3D from "$lib/plot/marks/arrows.svelte";
  import Segments from "$lib/plot/marks/segments.svelte";
  let plot = $state(),
    initialized = $state(false),
    data = $state.raw({}),
    mounted = $state(true);
  let mode = $state("2d"),
    straight = $state(false),
    zeroOnly = $state(false),
    subdivisions = $state(12);
  let showArrows = $state(true);
  let readbacks = 0,
    hits = 0;
  const held = [];
  function update(offset = 0) {
    const next = {
      start: np.array([
        [-0.7, -0.3 + offset],
        [0, 0],
      ]),
      end: np.array([
        [0.7, 0.3 + offset],
        [0, 0],
      ]),
      control1: np.array([
        [-0.4, 0.5],
        [0, 0],
      ]),
      control2: np.array([
        [0.4, -0.5],
        [0, 0],
      ]),
      width: np.array([0.07, 0.1]),
      color: np.array([0.2, 0.8]),
      zero: np.array([
        [0, 0],
        [0, 0],
      ]),
    };
    held.push(next);
    data = next;
  }
  onMount(() => {
    let active = true;
    const originals = {};
    let device;
    initializePlot().then(() => {
      if (!active) return;
      device = getWebGPUDevice();
      device.pushErrorScope("validation");
      for (const key of ["js", "jsAsync", "data", "dataSync"]) {
        originals[key] = JaxArray.prototype[key];
        JaxArray.prototype[key] = function (...args) {
          readbacks++;
          return originals[key].apply(this, args);
        };
      }
      update();
      initialized = true;
      window.__gpuMarks = {
        async settle() {
          await tick();
          await plot?.whenSettled();
        },
        async update() {
          for (let i = 0; i < 8; i++) {
            update(i / 100);
            await tick();
          }
        },
        async set(values) {
          if ("showArrows" in values) showArrows = values.showArrows;
          if ("mode" in values) mode = values.mode;
          if ("straight" in values) straight = values.straight;
          if ("zeroOnly" in values) zeroOnly = values.zeroOnly;
          if ("mounted" in values) mounted = values.mounted;
          if ("subdivisions" in values) subdivisions = values.subdivisions;
          await tick();
          await plot?.whenSettled();
        },
        diagnostics() {
          return { readbacks, hits, ...plot?.getDiagnostics() };
        },
        async error() {
          const error = await device.popErrorScope();
          return error?.message ?? null;
        },
      };
    });
    return () => {
      active = false;
      for (const [key, value] of Object.entries(originals))
        JaxArray.prototype[key] = value;
      held.forEach(disposeArrays);
      delete window.__gpuMarks;
    };
  });
</script>

{#if initialized && mounted}
  <Plot
    bind:this={plot}
    name="GPU marks"
    axes2d={false}
    width={480}
    height={320}
    type={mode}
    settings={{ showTrigger: false }}
  >
    {#if showArrows}<Arrows3D
        name="Arrows3D"
        start={zeroOnly ? data.zero : data.start}
        end={zeroOnly ? data.zero : data.end}
        width={data.width}
        color={data.color}
        onclick={() => hits++}
      />{/if}
    {#if !zeroOnly}
      <Segments
        name="Curves"
        start={data.start}
        end={data.end}
        control1={straight ? undefined : data.control1}
        control2={straight ? undefined : data.control2}
        color={data.color}
        width={data.width}
        {subdivisions}
        dashed
        dashSize={3}
        gapSize={2}
      />
    {/if}
  </Plot>
{/if}
