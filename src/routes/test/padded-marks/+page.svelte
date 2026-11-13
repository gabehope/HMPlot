<script>
  // TODO 17.3b fixture: marks over padded views. Each "padded" plot draws a Filter's rows (the
  // mark draws the Filter's input rows and hides the rest); each "reference" plot draws the same
  // rows filtered on the host. Axes are automatic, so domains must follow the kept rows; the
  // "centered" and "scaled" plots (17.3d) put a Calculate after the Filter on explicit axes,
  // where a mark may swap only its row opacity: it must not for a reduction (mean) whose values
  // follow the kept rows. The "sorted" plot (17.3e) draws a Line through a Sort's output, whose
  // kept rows come first in sorted order; "density" (17.3f) a Line through a grouped Density
  // whose groups without a kept row are hidden. "animated" (TODO 32.12) draws animated points over
  // a Filter with their own threshold and y column, so one update can change both. "rescaled"
  // (TODO 118.2) puts a Calculate before the Filter on explicit axes: one update changes the
  // column it draws and the kept rows together, so swapping the row opacity alone is not enough.
  import { onMount } from "svelte";
  import { Data, Plot, Filter, Calculate, Sort, Density, Points, Line, Rect, add, subtract, multiply, mean } from "$lib/index";
  const n = 24;
  const table = {
    x: Float32Array.from({ length: n }, (_, i) => i),
    y: Float32Array.from({ length: n }, (_, i) => ((i * 7) % 11) + 1),
    k: Float32Array.from({ length: n }, (_, i) => (i * 5) % 13),
  };
  let threshold = $state(4.5), references = $state(true);
  let animated = $state({ threshold: 4.5, y: "y" });
  let factor = $state(1);
  const kept = $derived.by(() => {
    const rows = [...table.k.keys()].filter((i) => table.k[i] > threshold);
    return { x: Float32Array.from(rows, (i) => table.x[i]), y: Float32Array.from(rows, (i) => table.y[i]), k: Float32Array.from(rows, (i) => table.k[i]) };
  });
  const plots = $state({}), marks = $state({});
  onMount(() => {
    window.paddedMarks = {
      plots, marks, table,
      get threshold() { return threshold; },
      setThreshold(value) { threshold = value; },
      setFactor(value) { factor = value; },
      // The references' own data changes length with the threshold: hide them to measure the padded plots.
      setReferences(value) { references = value; },
      setAnimated(next) { animated = { ...animated, ...next }; },
      /** The animated mark's rows: [x, y, row opacity] per physical row, as drawn now. */
      async readAnimated() {
        const mark = marks.animated.getMark(), renderer = mark.renderer, device = renderer.backend.device;
        const read = async (name, stride) => {
          const field = mark.fields.get(name), count = field.count;
          const gpu = renderer.backend.get(field.bufferNodeSource).buffer, bytes = count * stride * 4;
          const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
          const encoder = device.createCommandEncoder();
          encoder.copyBufferToBuffer(gpu, 0, staging, 0, bytes);
          device.queue.submit([encoder.finish()]);
          await staging.mapAsync(GPUMapMode.READ);
          const values = Array.from(new Float32Array(staging.getMappedRange()));
          staging.destroy();
          return { count, values };
        };
        const position = await read("position", 4), opacity = await read("interactionOpacity", 1);
        return Array.from({ length: position.count }, (_, i) => [position.values[i * 4], position.values[i * 4 + 1], opacity.values[i]]);
      },
      async settle() { await Promise.all(Object.values(plots).map((plot) => plot?.whenSettled?.().catch?.(() => {}))); },
    };
    return () => { delete window.paddedMarks; };
  });
  const size = { width: 170, height: 150, axes2d: true, toneMapping: 0, antialias: "off" };
  const fixed = { ...size, x: { domain: [-1, 24] }, y: { domain: [-8, 24] } };
  const centered = { dy: subtract("y", mean("y")) }, scaled = { y2: multiply("y", 2) };
  const rescaled = $derived({ y3: multiply("y", factor) });
</script>

<div class="grid">
  <Data value={table}>
    <Plot bind:this={plots.points} {...size}>
      <Filter where={{ field: "k", op: "gt", value: threshold }}>
        <Points bind:this={marks.points} x="x" y="y" size={5} fill="#1f3a93" hover />
      </Filter>
    </Plot>
    <Plot bind:this={plots.line} {...size}>
      <Filter where={{ field: "k", op: "gt", value: threshold }}>
        <Line bind:this={marks.line} x="x" y="y" width={3} color="#b03a2e" />
      </Filter>
    </Plot>
    <Plot bind:this={plots.rect} {...size}>
      <Filter where={{ field: "k", op: "gt", value: threshold }}>
        <Rect bind:this={marks.rect} x0="x" x1={add("x", 0.6)} y0={0} y1="y" fill="#1e8449" />
      </Filter>
    </Plot>
    <Plot bind:this={plots.centered} {...fixed}>
      <Filter where={{ field: "k", op: "gt", value: threshold }}>
        <Calculate columns={centered}><Points bind:this={marks.centered} x="x" y="dy" size={5} fill="#7d3c98" hover /></Calculate>
      </Filter>
    </Plot>
    <Plot bind:this={plots.scaled} {...fixed}>
      <Filter where={{ field: "k", op: "gt", value: threshold }}>
        <Calculate columns={scaled}><Points bind:this={marks.scaled} x="x" y="y2" size={5} fill="#ca6f1e" hover /></Calculate>
      </Filter>
    </Plot>
    <Plot bind:this={plots.rescaled} {...fixed}>
      <Calculate columns={rescaled}><Filter where={{ field: "k", op: "gt", value: threshold }}>
        <Points bind:this={marks.rescaled} x="x" y="y3" size={5} fill="#a04000" hover />
      </Filter></Calculate>
    </Plot>
    <Plot bind:this={plots.sorted} {...size}>
      <Filter where={{ field: "k", op: "gt", value: threshold }}>
        <Sort by="y"><Line bind:this={marks.sorted} x="x" y="y" width={3} color="#2e86c1" /></Sort>
      </Filter>
    </Plot>
    <Plot bind:this={plots.animated} {...fixed}>
      <Filter where={{ field: "k", op: "gt", value: animated.threshold }}>
        <Points bind:this={marks.animated} x="x" y={animated.y} size={5} fill="#884ea0" animation animationDuration={2000} animationEasing="linear" />
      </Filter>
    </Plot>
    <Plot bind:this={plots.density} {...size}>
      <Filter where={{ field: "k", op: "gt", value: threshold }}>
        <Density x="y" by="k" resolution={16}><Line bind:this={marks.density} x="x" y="density" width={3} color="#117a65" /></Density>
      </Filter>
    </Plot>
  </Data>
  {#if references}<Data value={kept}>
    <Plot bind:this={plots.pointsReference} {...size}>
      <!-- A row-opacity field (hover that fades, respond="hovered": hover alone has none since
        TODO 62.2) draws 2D points blended, as the padded mark's hidden rows do. -->
      <Points bind:this={marks.pointsReference} x="x" y="y" size={5} fill="#1f3a93" hover respond="hovered" />
    </Plot>
    <Plot bind:this={plots.lineReference} {...size}>
      <Line bind:this={marks.lineReference} x="x" y="y" width={3} color="#b03a2e" />
    </Plot>
    <Plot bind:this={plots.rectReference} {...size}>
      <Rect bind:this={marks.rectReference} x0="x" x1={add("x", 0.6)} y0={0} y1="y" fill="#1e8449" />
    </Plot>
    <Plot bind:this={plots.centeredReference} {...fixed}>
      <Calculate columns={centered}><Points bind:this={marks.centeredReference} x="x" y="dy" size={5} fill="#7d3c98" hover respond="hovered" /></Calculate>
    </Plot>
    <Plot bind:this={plots.scaledReference} {...fixed}>
      <Calculate columns={scaled}><Points bind:this={marks.scaledReference} x="x" y="y2" size={5} fill="#ca6f1e" hover respond="hovered" /></Calculate>
    </Plot>
    <Plot bind:this={plots.rescaledReference} {...fixed}>
      <Calculate columns={rescaled}><Points bind:this={marks.rescaledReference} x="x" y="y3" size={5} fill="#a04000" hover respond="hovered" /></Calculate>
    </Plot>
    <Plot bind:this={plots.sortedReference} {...size}>
      <Sort by="y"><Line bind:this={marks.sortedReference} x="x" y="y" width={3} color="#2e86c1" /></Sort>
    </Plot>
    <Plot bind:this={plots.densityReference} {...size}>
      <Density x="y" by="k" resolution={16}><Line bind:this={marks.densityReference} x="x" y="density" width={3} color="#117a65" /></Density>
    </Plot>
  </Data>{/if}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(8, 170px); gap: 8px; }
</style>
