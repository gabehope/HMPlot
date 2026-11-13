<script>
  // TODO 17.4 fixture: a Label and a Points3D whose opacity, align and blend a test changes.
  // An opacity that stays below 1 keeps the blend decision, so neither mark should rebuild;
  // align is a uniform, so it moves the text without a rebuild. The spherical Text3D's point and
  // size are uniforms too.
  import { onMount } from "svelte";
  import { Data, Plot, Text, Points3D, Text3D, add } from "$lib/index";
  const n = 12;
  const table = {
    x: Float32Array.from({ length: n }, (_, i) => (i % 4) / 3),
    y: Float32Array.from({ length: n }, (_, i) => Math.floor(i / 4) / 2),
    z: Float32Array.from({ length: n }, (_, i) => ((i * 5) % 7) / 6),
    name: Array.from({ length: n }, (_, i) => `label ${i}`),
  };
  let opacity = $state(0.9), align = $state("center"), blend = $state("normal"),
    textPosition = $state([30, 20, 0]), textSize = $state(6), title = $state("Labels"),
    labelOffset = $state(0), labelNames = $state.raw(table.name);
  const plots = $state({}), marks = $state({});
  onMount(() => {
    window.labelOptions = {
      plots, marks,
      set(values) {
        if ("opacity" in values) opacity = values.opacity;
        if ("align" in values) align = values.align;
        if ("blend" in values) blend = values.blend;
        if ("textPosition" in values) textPosition = values.textPosition;
        if ("textSize" in values) textSize = values.textSize;
        if ("title" in values) title = values.title;
        if ("labelOffset" in values) labelOffset = values.labelOffset;
        if ("labelNames" in values) labelNames = values.labelNames;
      },
      async settle() { await Promise.all(Object.values(plots).map((plot) => plot?.whenSettled?.())); },
    };
    return () => { delete window.labelOptions; };
  });
</script>

<Data value={table}>
  <div class="row">
    <Plot bind:this={plots.labels} width={400} height={300} axes2d toneMapping={0} antialias="off" x={{ domain: [-0.3, 1.3] }} y={{ domain: [-0.3, 1.3] }}>
      <Text bind:this={marks.labels} x={add("x", labelOffset)} y="y" text={labelNames} size={14} color="#1f3a93" {opacity} {align} {blend} />
      <Text3D bind:this={marks.title} position={[0.5, 1.15]} text={title} size={12} color="#30343b" />
    </Plot>
    <Plot bind:this={plots.points} type="3d" width={300} height={300} toneMapping={0}
      x={{ domain: [0, 1] }} y={{ domain: [0, 1] }} z={{ domain: [0, 1] }}>
      <Points3D bind:this={marks.points} x="x" y="y" z="z" size={12} fill="#b03a2e" {opacity} />
    </Plot>
    <Plot bind:this={plots.globe} coordinates="spherical" width={300} height={300} toneMapping={0}>
      <Text3D bind:this={marks.text} position={textPosition} text="North" size={textSize} color="#1e8449" />
    </Plot>
  </div>
</Data>

<style>
  .row { display: flex; gap: 8px; }
</style>
