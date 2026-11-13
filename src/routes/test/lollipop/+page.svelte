<script>
  // 10.9 fixtures: Lollipop stems below the baseline, in 3D, horizontal, hidden, themed, and
  // the third-party form from docs/USAGE.md. Plots have no axes and fixed domains, so a data
  // point's pixel is its fraction of the canvas.
  import { onMount } from "svelte";
  import { Plot, Theme } from "$lib/index";
import { Lollipop } from "$lib/charts/index.js";
  import CustomLollipop from "./CustomLollipop.svelte";
  const plots = $state({}), marks = $state({});
  onMount(() => { window.lollipopFixture = { plots, marks }; return () => { delete window.lollipopFixture; }; });
  const rows = { category: ["a", "b", "c", "d", "e", "f"], value: [18, 31, -12, 44, 26, -9] };
  const three = { x: [1, 2, 3, 4], y: [3, -2, 4, 1], z: [1, 2, 3, 4] };
  const common = { width: 300, height: 200, axes2d: false, toneMapping: 0, y: { domain: [-20, 50] } };
  const theme = { marks: { Lollipop: { size: 20, color: "#00aa00", width: 8 } } };
</script>

<Plot bind:this={plots.negative} data={rows} {...common}>
  <Lollipop bind:this={marks.negative} name="pops" x="category" y="value" fill="#c0504d" size={5} stem={{ color: "#0000ff", width: 4 }} />
</Plot>
<Plot bind:this={plots.raised} data={rows} {...common}>
  <Lollipop bind:this={marks.raised} name="pops" x="category" y="value" baseline={25} fill="#c0504d" size={5} stem={{ color: "#0000ff", width: 4 }} />
</Plot>
<Plot bind:this={plots.three} data={three} type="3d" width={300} height={200} toneMapping={0}>
  <Lollipop bind:this={marks.three} name="pops" x="x" y="y" z="z" size={5} />
</Plot>
<Plot bind:this={plots.horizontal} data={rows} width={300} height={200} axes2d={false} toneMapping={0} x={{ domain: [-20, 50] }}>
  <Lollipop bind:this={marks.horizontal} name="pops" x="value" y="category" fill="#c0504d" size={5} stem={{ color: "#0000ff", width: 4 }} />
</Plot>
<Plot bind:this={plots.hidden} data={rows} {...common}>
  <Lollipop bind:this={marks.hidden} name="pops" x="category" y="value" visible={false} fill="#c0504d" size={5} stem={{ color: "#0000ff", width: 4 }} />
</Plot>
<Plot bind:this={plots.themed} data={rows} {...common}>
  <Theme value={theme}><Lollipop bind:this={marks.themed} name="pops" x="category" y="value" fill="#c0504d" /></Theme>
</Plot>
<Plot bind:this={plots.custom} data={rows} {...common}>
  <CustomLollipop bind:this={marks.custom} name="pops" x="category" y="value" fill="#c0504d" size={5} stemColor="#0000ff" stemWidth={4} />
</Plot>
