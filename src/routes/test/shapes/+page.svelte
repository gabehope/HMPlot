<script>
  // Stage 8 fixtures: shape as a data channel and custom polygon shapes.
  import { onMount } from "svelte";
  import { Plot, Points, Legend, categorical, registerShape } from "$lib/index";
import { Swarm } from "$lib/charts/index.js";
  import { shapeNames } from "$lib/plot/utils/shapes.js";
  // Registered before the marks mount; "late" and "pending" are registered by the tests after mount.
  registerShape("fivefold", [[0, 1], [0.95, 0.31], [0.59, -0.81], [-0.59, -0.81], [-0.95, 0.31]]);
  // A curved custom shape, drawn from the distance field (TODO 55).
  registerShape("wave", { path: "M-1 -0.4 C-0.5 0.8 0 -0.9 0.5 0.4 C0.8 1 1 0.2 1 -0.4 C0.6 -1 -0.6 -1 -1 -0.4 Z" });
  // The same polygon as the built-in square, for the size comparison.
  registerShape("unitsquare", [[-1, -1], [1, -1], [1, 1], [-1, 1]]);
  const plots = $state({}), marks = $state({});
  let outlineWidth = $state(0.7);
  onMount(() => { window.shapeFixture = { plots, marks, registerShape,
    setOutlineWidth: value => { outlineWidth = value; } }; return () => { delete window.shapeFixture; }; });
  const rows = {
    x: [10, 30, 50, 70, 90, 10, 30, 50, 70, 90],
    y: [70, 70, 70, 70, 70, 30, 30, 30, 30, 30],
    species: ["Adelie", "Gentoo", "Chinstrap", "Adelie", "Gentoo", "Chinstrap", "Adelie", "Gentoo", "Chinstrap", "Adelie"],
    island: ["Biscoe", "Biscoe", "Biscoe", "Biscoe", "Biscoe", "Dream", "Dream", "Dream", "Dream", "Dream"],
  };
  const custom = categorical({ domain: ["Biscoe", "Dream"], range: ["fivefold", "star"] });
  // Every built-in and the curved custom shape, one per point on a 6 x 4 grid, in one column.
  const galleryShapes = shapeNames().filter((name) => name !== "fivefold" && name !== "unitsquare");
  const gallery = {
    x: galleryShapes.map((_, i) => 10 + (i % 6) * 16),
    y: galleryShapes.map((_, i) => 85 - Math.floor(i / 6) * 23),
  };
  // Swarm spacing: one category, 60 values in a narrow band, three shape categories.
  const swarm = {
    g: Array.from({ length: 60 }, () => "all"),
    v: Array.from({ length: 60 }, (_, i) => 40 + (i % 10) * 2),
    s: Array.from({ length: 60 }, (_, i) => ["a", "b", "c"][i % 3]),
  };
  const common = { width: 420, height: 180, axes2d: true, toneMapping: 0, x: { domain: [0, 100] }, y: { domain: [0, 100] } };
</script>

<Plot bind:this={plots.channel} data={rows} {...common}>
  <Points bind:this={marks.channel} x="x" y="y" fill="species" shape="island" size={9} />
  <Legend for={marks.channel} channel="shape" label="Island" position="right" />
</Plot>
<Plot bind:this={plots.literal} {...common}>
  <Points bind:this={marks.literal} x={[20, 50, 80]} y={[50, 50, 50]} shape={["circle", "square", "star"]} size={15} fill="#1f4e9a" />
</Plot>
<Plot bind:this={plots.custom} data={rows} {...common}>
  <Points bind:this={marks.custom} x="x" y="y" shape="island" shapeScale={custom} size={20} fill="#c0504d" />
  <Legend for={marks.custom} channel="shape" label="Custom" position="right" />
</Plot>
<Plot bind:this={plots.constant} {...common}>
  <Points bind:this={marks.constant} x={[50]} y={[50]} shape="circle" size={15} fill="#00aa00" />
</Plot>
<Plot bind:this={plots.merged} data={rows} {...common}>
  <Points bind:this={marks.merged} x="x" y="y" fill="island" shape="island" size={9} />
  <Legend for={marks.merged} channel="shape" label="Merged shape" position="right" />
  <Legend for={marks.merged} channel="fill" label="Merged fill" position="bottom" />
</Plot>
<!-- Points: circle, literal square, per-row square channel, and the custom unit square, left to right. -->
<Plot bind:this={plots.flat} {...common} axes2d={false}>
  <Points bind:this={marks.flatCircle} x={[12.5]} y={[50]} shape="circle" size={15} fill="#e0301e" />
  <Points bind:this={marks.flatSquare} x={[37.5]} y={[50]} shape="square" size={15} fill="#e0301e" />
  <Points bind:this={marks.flatChannel} x={[62.5]} y={[50]} shape={["square"]} size={15} fill="#e0301e" />
  <Points bind:this={marks.flatCustom} x={[87.5]} y={[50]} shape="unitsquare" size={15} fill="#e0301e" />
</Plot>
<Plot bind:this={plots.pending} {...common}>
  <Points bind:this={marks.pending} x={[20, 50, 80]} y={[50, 50, 50]} shape={["pending", "circle", "circle"]} size={15} fill="#1f4e9a" />
</Plot>
{#each [["swarmShape", { shape: "s" }], ["swarmCircle", {}]] as [key, props]}
  <Plot bind:this={plots[key]} data={swarm} {...common} y={{ domain: [30, 70] }}>
    <Swarm bind:this={marks[key]} x="g" y="v" size={5} {...props} />
  </Plot>
{/each}
<Plot bind:this={plots.gallery} {...common} width={600} height={400} axes2d={false}>
  <Points bind:this={marks.gallery} x={gallery.x} y={gallery.y} shape={galleryShapes} size={28} fill="#1f4e9a" />
</Plot>
<!-- The theme's default shape="circle" stays a symbol even when the data has a column named circle. -->
<Plot bind:this={plots.themed} data={{ x: [30, 70], y: [50, 50], circle: ["a", "b"] }} {...common}>
  <Points bind:this={marks.themed} x="x" y="y" size={15} fill="#00aa00" />
</Plot>
<!-- TODO 64: fill="transparent" draws a hollow point, its outline alone, over a red point. -->
<Plot bind:this={plots.hollow} {...common} width={200} height={200} axes2d={false}>
  <Points x={[50]} y={[50]} size={20} fill="#d02020" />
  <Points bind:this={marks.hollow} x={[50]} y={[50]} size={40} fill="transparent" outlineColor="#2040d0" outlineWidth={2} />
</Plot>
<!-- Small, contrasting outlines expose coverage dithering at HiDPI. -->
<Plot bind:this={plots.outlined} width={240} height={120} axes2d={false} toneMapping={0}
  marginLeft={0} marginRight={0} marginTop={0} marginBottom={0} background="#577eac"
  x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
  <Points bind:this={marks.outlined} x={[20, 40, 60, 80]} y={[50, 50, 50, 50]}
    size={7} fill="#b77450" outlineColor="#fffaf0" {outlineWidth} />
</Plot>
