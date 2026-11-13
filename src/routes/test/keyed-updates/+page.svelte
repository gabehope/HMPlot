<script>
  // Stage 13.8 fixtures: keyed updates in quick succession and after an idle gap, keyed
  // re-orders under animate(), per-axis animate(), animate() on a constant, and a channel
  // expression over a tweened Calculate column. x encodes each key (a = 1, b = 2, ...), so a
  // point's x says which row it is whatever the union order.
  import { onMount } from "svelte";
  import LayeredSignal from "../../examples/stress/LayeredSignal.svelte";
  import * as animation from "$lib/plot/utils/animation.js";
  import { Plot, Data, Calculate, Sort, Points, Text, Line, Area,  Segments, Rect, Prism, Arrows3D, Points3D, animate, tween, multiply, add, subtract, mean, sin, cos, divide, where } from "$lib/index";
import { Arrows, ErrorBars } from "$lib/charts/index.js";
  import { numpy as np } from "$lib/jax.js";
  let keyedPlot = $state(), keyedPoints = $state(), reorderPlot = $state(), reorderPoints = $state(),
    axisPlot = $state(), axisPoints = $state(), constantPlot = $state(), constantPoints = $state(),
    tweenPlot = $state(), tweenPoints = $state(), idlePlot = $state(), idlePoints = $state();
  const table = (keys, ys) => ({ id: keys, x: keys.map((key) => key.charCodeAt(0) - 96), y: ys });
  let keyedRows = $state(table(["a", "b", "c"], [0, 0, 0]));
  let reorderRows = $state(table(["a", "b", "c"], [1, 2, 3]));
  let axisRows = $state({ x: [1, 2, 3], y: [1, 1, 1] });
  let constantOpacity = $state(0.2);
  let tweenRows = $state({ x: [1, 2, 3], v: [0, 0, 0] });
  let idleRows = $state({ x: [1, 2, 3], y: [0, 0, 0] });
  // The animation-engine example: keyed animate() with enter/exit on a log axis, plus @time
  // satellites on fixed rows of their own.
  let engineStep = $state(0), enginePlot = $state(), enginePoints = $state(), satellitePoints = $state();
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const engineRows = $derived.by(() => {
    const ids = Array.from({ length: 12 }, (_, i) => `r${(i + engineStep) % 15}`);
    return { id: ids, x: ids.map((_, i) => 1 + i), y: ids.map((id, i) => 10 ** (1 + 2 * noise(i + engineStep, 1))) };
  });
  const slot = Array.from({ length: 12 }, (_, i) => i);
  const slots = { x: slot.map((i) => 1 + i), y: slot.map(() => 3), angle: slot };
  // The interaction-keyed-updates example, as published.
  let exampleFrame = $state(0), examplePlot = $state(), examplePoints = $state(), exampleLabels = $state();
  const exampleRows = $derived.by(() => Array.from({ length: 48 }, (_, i) => {
    const id = (i + exampleFrame * 8) % 80;
    return { id: `row-${id}`, group: ["A", "B", "C", "D"][id % 4], x: 0.1 + 0.8 * ((id * 17) % 79) / 78, y: 0.5 + 0.34 * Math.sin(id * 0.6 + exampleFrame * 0.12) };
  }));
  // One Label whose text (hence its atlas) changes; nothing else draws red on its plot.
  let labelRows = $state({ x: [1], y: [1], t: ["I"] }), labelPlot = $state(), labelMark = $state();
  // A channel over a reduction (no `by`): each revision gives it a new data-dependent scalar.
  let reductionRows = $state({ x: [1, 2, 3, 4], y: [1, 2, 3, 4] }), reductionPlot = $state(), reductionPoints = $state();
  // A Sort view: its rows map back to source rows, so a re-sort keeps each row's motion.
  let sortOrder = $state("asc"), sortPlot = $state(), sortPoints = $state();
  const sortRows = { v: [3, 1, 2], x: [1, 2, 3], y: [1, 2, 3] };
  // TODO 32.13: keyed enter and exit fades on every kind that stages its instances
  // (utils/markKinds.js `keyed`) besides the points and labels above, and hover dimming on every
  // kind with row opacity (those and ROW_KINDS); x encodes the key.
  let kindKeys = $state(["a", "b", "c"]);
  const kindRows = $derived.by(() => {
    const x = kindKeys.map((key) => key.charCodeAt(0) - 96);
    return { id: kindKeys, x, y: x, lo: x.map((v) => v - 0.4), hi: x.map((v) => v + 0.4),
      start: np.array(x.map((v) => [v, 1])), end: np.array(x.map((v) => [v, 3])) };
  });
  const KINDS = ["Rect", "Prism", "Segments", "Arrows3D", "Arrows", "ErrorBars", "Points3D"];
  // Area and its uncertainty-band form exercise the same public component with different bounds.
  const ROW_KINDS = ["Points", "Text", "Line", "Area", "Area band"];
  const kindPlots = $state({}), kindMarks = $state({});
  /** A kind's mark now: its instances (its geometry field's rows) and each one's row opacity. */
  async function readOpacity(kind) {
    const mark = kindMarks[kind].getMark(), field = mark.fields.get("interactionOpacity");
    const rows = mark.fields.get(["Segments", "Arrows3D", "Arrows", "ErrorBars", "Line", "Area", "Area band"].includes(kind) ? "start" : "position")?.count;
    if (!field?.bufferNodeSource || field.count !== rows) return { rows, opacity: null };
    const renderer = mark.renderer, device = renderer.backend.device, count = field.count;
    const staging = device.createBuffer({ size: Math.max(16, count * 4), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(renderer.backend.get(field.bufferNodeSource).buffer, 0, staging, 0, count * 4);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const opacity = Array.from(new Float32Array(staging.getMappedRange())).slice(0, count);
    staging.destroy();
    return { rows, opacity };
  }
  const errors = [];
  // Read a mark's live position rows and one of its uniform options in the same tick.
  async function read(handle, option) {
    const mark = handle.getMark();
    const field = mark.fields.get("position"), attribute = field.bufferNodeSource;
    const renderer = mark.renderer, device = renderer.backend.device;
    const count = field.count, bytes = Math.max(16, count * 16);
    const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const value = option ? mark.animatedOptionNodes?.get(option)?.value : undefined;
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(renderer.backend.get(attribute).buffer, 0, staging, 0, count * 16);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const values = Array.from(new Float32Array(staging.getMappedRange()));
    staging.destroy();
    const rows = [];
    for (let i = 0; i < count; i++) rows.push(values.slice(i * 4, i * 4 + 3));
    return { rows, value, time: mark.view.clock.time };
  }
  // Sample until `until` ms have passed, calling `step(index)` before each sample.
  async function sample(handle, { until = 1500, every = 30, option, steps = {} } = {}) {
    const out = [], started = performance.now();
    while (performance.now() - started < until) {
      const at = performance.now() - started;
      for (const [when, step] of Object.entries(steps)) if (!step.done && at >= Number(when)) { step.done = true; step(); }
      out.push({ at, ...(await read(handle, option)) });
      await new Promise((resolve) => setTimeout(resolve, every));
    }
    return out;
  }
  onMount(() => {
    window.keyedUpdates = {
      get keyedPlot() { return keyedPlot; }, get keyedPoints() { return keyedPoints; },
      get reorderPlot() { return reorderPlot; }, get reorderPoints() { return reorderPoints; },
      get axisPlot() { return axisPlot; }, get axisPoints() { return axisPoints; },
      get constantPlot() { return constantPlot; }, get constantPoints() { return constantPoints; },
      get tweenPlot() { return tweenPlot; }, get tweenPoints() { return tweenPoints; },
      get idlePlot() { return idlePlot; }, get idlePoints() { return idlePoints; },
      read, sample, errors, animation,
      setKeyed: (keys, ys) => { keyedRows = table(keys, ys); },
      kinds: KINDS, rowKinds: ROW_KINDS, kindPlots, get kindMarks() { return kindMarks; },
      /** Hover row `row` of a kind's table, as a pointer over it would. */
      hoverKind: (kind, row) => { const owner = ((m) => m?.view.marks.of(m))(kindMarks[kind].getMark())?.interaction?.owner ?? kindMarks[kind].getMark().interactionOwner; owner.hover.replace(owner, [row]); },
      setKindKeys: (keys) => { kindKeys = keys; },
      readOpacity,
      setReorder: (keys, ys) => { reorderRows = table(keys, ys); },
      setAxis: (rows) => { axisRows = rows; },
      setOpacity: (value) => { constantOpacity = value; },
      setTween: (v) => { tweenRows = { x: [1, 2, 3], v }; },
      setIdle: (y) => { idleRows = { x: [1, 2, 3], y }; },
      get enginePlot() { return enginePlot; }, get enginePoints() { return enginePoints; },
      get satellitePoints() { return satellitePoints; },
      nextEngine: () => { engineStep++; },
      get examplePlot() { return examplePlot; }, get examplePoints() { return examplePoints; },
      get exampleLabels() { return exampleLabels; },
      advanceExample: () => { exampleFrame++; },
      get sortPlot() { return sortPlot; }, get sortPoints() { return sortPoints; },
      setSortOrder: (order) => { sortOrder = order; },
      get labelPlot() { return labelPlot; }, get labelMark() { return labelMark; },
      setLabelText: (t) => { labelRows = { x: [1], y: [1], t: [t] }; },
      get reductionPlot() { return reductionPlot; }, get reductionPoints() { return reductionPoints; },
      setReduction: (y) => { reductionRows = { x: [1, 2, 3, 4], y }; },
    };
    const error = (event) => errors.push(String(event.reason?.message ?? event.message ?? event.reason));
    window.addEventListener("unhandledrejection", error);
    window.addEventListener("error", error);
    return () => {
      window.removeEventListener("unhandledrejection", error);
      window.removeEventListener("error", error);
      delete window.keyedUpdates;
    };
  });
</script>

<h3>keyed, implicit animation with fades (the interaction-keyed-updates setup)</h3>
<Plot bind:this={keyedPlot} data={keyedRows} key="id" width={360} height={200} axes2d
  x={{ domain: [0, 6] }} y={{ domain: [-1, 11] }}>
  <Points bind:this={keyedPoints} x="x" y="y" size={4}
    animation animationDuration={500} enterEffect="fade" exitEffect="fade" />
</Plot>

<h3>keyed re-order under animate() with the mark's animation off</h3>
<Plot bind:this={reorderPlot} data={reorderRows} key="id" width={360} height={200} axes2d
  x={{ domain: [0, 6] }} y={{ domain: [0, 11] }}>
  <Points bind:this={reorderPoints} x="x" y={animate("y", { duration: 1000, easing: "linear" })} size={4} />
</Plot>

<h3>animate() on x only</h3>
<Plot bind:this={axisPlot} data={axisRows} width={360} height={200} axes2d
  x={{ domain: [0, 11] }} y={{ domain: [0, 11] }}>
  <Points bind:this={axisPoints} x={animate("x", { duration: 1500, easing: "linear" })} y="y" size={4} />
</Plot>

<h3>animate() on a constant opacity</h3>
<Plot bind:this={constantPlot} data={{ x: [1, 2, 3], y: [1, 2, 3] }} width={360} height={200} axes2d
  x={{ domain: [0, 4] }} y={{ domain: [0, 4] }}>
  <Points bind:this={constantPoints} x="x" y="y" size={4}
    opacity={animate(constantOpacity, { duration: 1000, easing: "linear" })} />
</Plot>

<h3>an expression over a tweened Calculate column</h3>
<Plot bind:this={tweenPlot} data={tweenRows} width={360} height={200} axes2d
  x={{ domain: [0, 4] }} y={{ domain: [-1, 25] }}>
  <Calculate columns={{ t: tween("v", { duration: 1000, easing: "linear" }) }}>
    <Points bind:this={tweenPoints} x="x" y={multiply("t", 2)} size={4} />
  </Calculate>
</Plot>

<h3>implicit animation after an idle gap</h3>
<Plot bind:this={idlePlot} data={idleRows} width={360} height={200} axes2d
  x={{ domain: [0, 4] }} y={{ domain: [-1, 11] }}>
  <Points bind:this={idlePoints} x="x" y="y" size={4} animation animationDuration={600} animationEasing="linear" />
</Plot>

<h3>the animation-engine example</h3>
<Plot bind:this={enginePlot} data={engineRows} key="id" width={500} height={300} axes2d
  x={{ domain: [0, 13] }} y={{ domain: [1, 2000], transform: "log" }}>
  <Points bind:this={enginePoints} x="x" y={animate("y", { duration: 900, easing: "cubic-in-out", enter: 1, exit: 1500 })}
    size={7} fill="#547ba2" />
  <Data value={slots}>
    <Points bind:this={satellitePoints} x={add("x", multiply(0.35, cos(add(divide("@time", 700), "angle"))))}
      y={multiply("y", add(1, multiply(0.25, sin(add(divide("@time", 700), "angle")))))}
      size={3} fill="#cf8955" />
  </Data>
</Plot>

<h3>the interaction-keyed-updates example</h3>
<Plot bind:this={examplePlot} data={exampleRows} key="id" width={500} height={300} axes2d x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Points bind:this={examplePoints} x="x" y="y" fill="group" size={where("@hovered", 12, 7)}
    hover select brush respond={["hovered", "selected", "brushed"]}
    animation animationDuration={500} enterEffect="fade" exitEffect="fade" />
  <Text bind:this={exampleLabels} x="x" y="y" text="id" size={10} dy={-17}
    respond={["selected", "hovered"]} selectionOpacity={0.15}
    animation animationDuration={200} enterEffect="fade" exitEffect="fade" />
</Plot>

<h3>a Label whose text changes</h3>
<Plot bind:this={labelPlot} data={labelRows} width={360} height={120} x={{ domain: [0, 2] }} y={{ domain: [0, 2] }}>
  <Text bind:this={labelMark} x="x" y="y" text="t" size={28} color="#d01010" />
</Plot>

<h3>a channel over a reduction</h3>
<Plot bind:this={reductionPlot} data={reductionRows} width={360} height={200} axes2d x={{ domain: [0, 5] }} y={{ domain: [-10, 10] }}>
  <Points bind:this={reductionPoints} x="x" y={subtract("y", mean("y"))} size={4} />
</Plot>

<h3>implicit animation over a Sort view</h3>
<Plot bind:this={sortPlot} data={sortRows} width={360} height={200} axes2d x={{ domain: [0, 4] }} y={{ domain: [0, 4] }}>
  <Sort by="v" order={sortOrder}>
    <Points bind:this={sortPoints} x="x" y="y" size={4} animation animationDuration={800} />
  </Sort>
</Plot>

<h3>the layered-signal example</h3>
<div class="layered"><LayeredSignal /></div>

<h3>keyed enter and exit on every keyed kind</h3>
<!-- respond="hovered": hover alone fades nothing (TODO 62.2); the dimming test asks for it. -->
<div class="kinds">
  {#each KINDS as kind (kind)}
    <Plot bind:this={kindPlots[kind]} data={kindRows} key="id" width={150} height={110}
      type={kind === "Prism" || kind === "Points3D" ? "3d" : "2d"} x={{ domain: [0, 6] }} y={{ domain: [0, 6] }}>
      {#if kind === "Rect"}<Rect bind:this={kindMarks[kind]} x0="x" x1={add("x", 0.5)} y0={0} y1="y" animation animationDuration={1500} animationEasing="linear" enterEffect="fade" exitEffect="fade" hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "Prism"}<Prism bind:this={kindMarks[kind]} x="x" y="y" width={0.5} depth={0.5} z0={0} z1="y" animation animationDuration={1500} animationEasing="linear" enterEffect="fade" exitEffect="fade" hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "Segments"}<Segments bind:this={kindMarks[kind]} start="start" end="end" width={4} animation animationDuration={1500} animationEasing="linear" enterEffect="fade" exitEffect="fade" hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "Arrows3D"}<Arrows3D bind:this={kindMarks[kind]} start="start" end="end" animation animationDuration={1500} animationEasing="linear" enterEffect="fade" exitEffect="fade" hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "Arrows"}<Arrows bind:this={kindMarks[kind]} start="start" end="end" animation animationDuration={1500} animationEasing="linear" enterEffect="fade" exitEffect="fade" hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "ErrorBars"}<ErrorBars bind:this={kindMarks[kind]} x="x" y="y" lower="lo" upper="hi" animation animationDuration={1500} animationEasing="linear" enterEffect="fade" exitEffect="fade" hover respond="hovered" selectionOpacity={0.25} />
      {:else}<Points3D bind:this={kindMarks[kind]} x="x" y="y" z={0} size={0.4} animation animationDuration={1500} animationEasing="linear" enterEffect="fade" exitEffect="fade" hover respond="hovered" selectionOpacity={0.25} />{/if}
    </Plot>
  {/each}
  {#each ROW_KINDS as kind (kind)}
    <Plot bind:this={kindPlots[kind]} data={kindRows} key="id" width={150} height={110} x={{ domain: [0, 6] }} y={{ domain: [0, 6] }}>
      {#if kind === "Points"}<Points bind:this={kindMarks[kind]} x="x" y="y" size={5} hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "Text"}<Text bind:this={kindMarks[kind]} x="x" y="y" text="id" size={14} hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "Line"}<Line bind:this={kindMarks[kind]} x="x" y="y" width={3} hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "Area"}<Area bind:this={kindMarks[kind]} x="x" upper="y" lower={0} hover respond="hovered" selectionOpacity={0.25} />
      {:else if kind === "Area band"}<Area opacity={0.2} bind:this={kindMarks[kind]} x="x" lower="lo" upper="hi" hover respond="hovered" selectionOpacity={0.25} />{/if}
    </Plot>
  {/each}
</div>

<style>
  .kinds { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
