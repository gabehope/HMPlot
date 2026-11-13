<script>
  // 7C C1: every mark that takes RGB colors, one small plot each, with red, green, and blue
  // rows, so a PNG export shows whether each mark draws its per-row colors.
  import { onMount } from "svelte";
  import { Plot, Points, Segments, Arrows3D, Text, Rect, Area, Line } from "$lib/index";
import { Arrows, ErrorBars } from "$lib/charts/index.js";
  const plots = $state({});
  onMount(() => { window.rgbMarks = { plots }; return () => { delete window.rgbMarks; }; });
  const rgb = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const pairs = [[1, 0, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1]];
  const start = [[15, 20], [45, 20], [75, 20]], end = [[25, 80], [55, 80], [85, 80]];
  const common = { width: 240, height: 140, axes2d: false, toneMapping: 0, x: { domain: [0, 100] }, y: { domain: [0, 100] } };
</script>

<Plot bind:this={plots.Points} {...common}>
  <Points x={[20, 50, 80]} y={[50, 50, 50]} fill={rgb} size={12} />
</Plot>
<Plot bind:this={plots.Segments} {...common}>
  <Segments {start} {end} color={rgb} width={8} />
</Plot>
<Plot bind:this={plots.Arrows3D} {...common}>
  <Arrows3D {start} {end} color={rgb} width={8} />
</Plot>
<Plot bind:this={plots.Arrows} {...common}>
  <Arrows {start} {end} color={rgb} width={8} headLength={14} headWidth={16} />
</Plot>
<Plot bind:this={plots.Text} {...common}>
  <Text x={[20, 50, 80]} y={[50, 50, 50]} text={["M", "M", "M"]} color={rgb} size={40} />
</Plot>
<Plot bind:this={plots.Rect} {...common}>
  <Rect x0={[10, 40, 70]} x1={[30, 60, 90]} y0={20} y1={[80, 80, 80]} fill={rgb} />
</Plot>
<Plot bind:this={plots.Area} {...common}>
  <!-- Areas default to opacity 0.2; opaque here so the colors are exact. -->
  <Area x={[5, 30, 35, 65, 70, 95]} upper={[80, 80, 80, 80, 80, 80]} lower={20} fill={pairs} opacity={1} />
</Plot>
<Plot bind:this={plots.ErrorBars} {...common}>
  <ErrorBars x={[20, 50, 80]} y={[50, 50, 50]} lower={[20, 20, 20]} upper={[80, 80, 80]} color={rgb} width={8} capSize={16} />
</Plot>
<Plot bind:this={plots.Line} {...common}>
  <Line x={[10, 30, 40, 60, 70, 90]} y={[50, 50, 50, 50, 50, 50]} series={["a", "a", "b", "b", "c", "c"]} color={pairs} width={8} />
</Plot>
