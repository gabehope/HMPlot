<script>
  // TODO 130.2 parity: a mark converted to a template (?impl=host, the library's) against a copy
  // of its hand-written component (?impl=legacy) in the same scene, for a test that compares
  // pixels, SVG, descriptions and handles. ?case= picks the scene; its prefix the mark.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Plot, Theme, Points, Legend, Mapping } from "$lib/index";
  import { Ecdf, Bar, Histogram, Swarm, Smooth, RuleX, RuleY, Callout, DensityContour, DensityBands, ErrorBars, Lollipop, BoxPlot, Violin, Pie } from "$lib/charts/index.js";
  import LegacyEcdf from "./legacy/Ecdf.svelte";
  import LegacyBar from "./legacy/Bar.svelte";
  import LegacyHistogram from "./legacy/Histogram.svelte";
  import LegacySwarm from "./legacy/Swarm.svelte";
  import LegacySmooth from "./legacy/Smooth.svelte";
  import LegacyRuleX from "./legacy/RuleX.svelte";
  import LegacyRuleY from "./legacy/RuleY.svelte";
  import LegacyCallout from "./legacy/Callout.svelte";
  import LegacyDensityContour from "./legacy/DensityContour.svelte";
  import LegacyErrorBars from "./legacy/ErrorBars.svelte";
  import LegacyLollipop from "./legacy/Lollipop.svelte";
  import LegacyBoxPlot from "./legacy/BoxPlot.svelte";
  import LegacyViolin from "./legacy/Violin.svelte";
  import LegacyPie from "./legacy/Pie.svelte";
  const name = page.url.searchParams.get("case") ?? "ecdf-basic", mark = name.split("-")[0];
  const legacy = page.url.searchParams.get("impl") === "legacy";
  const Impl = { ecdf: legacy ? LegacyEcdf : Ecdf, bar: legacy ? LegacyBar : Bar, histogram: legacy ? LegacyHistogram : Histogram, swarm: legacy ? LegacySwarm : Swarm, smooth: legacy ? LegacySmooth : Smooth,
    rulex: legacy ? LegacyRuleX : RuleX, ruley: legacy ? LegacyRuleY : RuleY, callout: legacy ? LegacyCallout : Callout,
    densitycontour: legacy ? LegacyDensityContour : DensityContour, densitybands: legacy ? LegacyDensityContour : DensityBands, errorbars: legacy ? LegacyErrorBars : ErrorBars,
    lollipop: legacy ? LegacyLollipop : Lollipop, boxplot: legacy ? LegacyBoxPlot : BoxPlot, violin: legacy ? LegacyViolin : Violin, pie: legacy ? LegacyPie : Pie }[mark];
  // Fixed samples: three groups, each a spread of 12 values.
  const samples = { value: [], g: [] };
  for (const [index, group] of ["a", "b", "c"].entries())
    for (let i = 0; i < 12; i++) { samples.value.push(index * 2 + ((i * 7) % 12) / 3); samples.g.push(group); }
  // Bars: three categories, two series, one negative value.
  const sales = { region: ["N", "N", "S", "S", "W", "W"], product: ["p", "q", "p", "q", "p", "q"], sales: [3, 2, 4, -1, 2, 5], floor: [1, 1, 0, 0, 2, 2] };
  // A noisy rising trend for fits.
  const trend = { t: [], v: [] };
  for (let i = 0; i < 30; i++) { trend.t.push(i / 3); trend.v.push(1 + 0.4 * (i / 3) + 0.08 * (i / 3) ** 2 + (((i * 7) % 11) - 5) / 6); }
  // Intervals: four groups, one reversed (c's upper is below its lower: not drawn).
  const intervals = { g: ["a", "b", "c", "d"], t: [1, 2, 3, 4], m: [2, 3.5, 1, 4], lo: [1, 3, 2.5, 2], hi: [3, 4, 1.5, 5] };
  // Pies: four regions in two rings.
  const pies = { region: ["N", "E", "S", "W", "N", "E", "S", "W"], ring: ["a", "a", "a", "a", "b", "b", "b", "b"], sales: [10, 38, 12, 27, 15, 32, 27, 24] };
  const regions = { domain: ["N", "E", "S", "W"], range: ["#e4572e", "#2a6fdb", "#1aa340", "#7a36b4"] };
  const palette = { domain: ["a", "b", "c"], range: ["#e4572e", "#2a6fdb", "#1aa340"] };
  const products = { domain: ["p", "q"], range: ["#e4572e", "#2a6fdb"] };
  const cases = {
    "ecdf-basic": { x: "value" },
    "ecdf-by": { x: "value", by: "g", width: 3 },
    "ecdf-complementary": { x: "value", by: "g", complementary: true },
    "ecdf-count": { x: "value", normalize: "count" },
    "ecdf-color": { x: "value", by: "g", color: "#7a36b4", opacity: 0.6 },
    "ecdf-theme": { x: "value" },
    "ecdf-legend": { x: "value", by: "g" },
    "bar-vertical": { x: "region", y: "sales" },
    "bar-horizontal": { x: "sales", y: "region" },
    "bar-orientation": { x: "region", y: "sales", orientation: "vertical", fill: "#808080" },
    "bar-stack": { x: "region", y: "sales", fill: "product" },
    "bar-group": { x: "region", y: "sales", fill: "product", arrange: "group", bandFraction: 0.6 },
    "bar-overlap": { x: "region", y: "sales", baseline: "floor", opacity: 0.5 },
    "bar-theme": { x: "region", y: "sales" },
    "histogram-x": { x: "value" },
    "histogram-y": { y: "value", fill: "#2a6fdb" },
    "histogram-bins": { x: "value", bins: 8, normalization: "density", opacity: 0.6 },
    "histogram-edges": { x: "value", bins: [0, 1.5, 3, 4.5, 6, 7.5] },
    "histogram-array": { x: [1, 2, 2, 3, 3, 3, 4, 4, 5], bins: 5 },
    "histogram-series": { x: Object.assign([1, 2, 2, 3, 3, 3, 4], { metadata: { name: "height" } }), bins: 4 },
    "histogram-brush": { x: "value", bins: 10, brush: true },
    "histogram-theme": { x: "value", bins: 12 },
    "swarm-x": { x: "g", y: "value", size: 6 },
    "swarm-y": { x: "value", y: "g", color: "g", size: 6, padding: 2 },
    "swarm-orientation": { x: "value", y: "value", orientation: "horizontal", seed: 7, opacity: 0.6 },
    "swarm-theme": { x: "g", y: "value" },
    "smooth-linear": { x: "t", y: "v" },
    "smooth-poly": { x: "t", y: "v", method: "poly", order: 2, color: "#e4572e", width: 3, fill: "#1aa340", opacity: 0.4 },
    "smooth-noband": { x: "t", y: "v", band: false, dash: [4, 2] },
    "smooth-hidden": { x: "t", y: "v", visible: false },
    "smooth-theme": { x: "t", y: "v" },
    "rulex-constant": { x: 3 },
    "rulex-column": { x: "value", color: "g", opacity: 0.5 },
    "rulex-ends": { x: 2, y0: 1, y1: 4, width: 3, dash: [6, 2] },
    "ruley-constant": { y: 2.5, color: "#e4572e", dash: true },
    "ruley-ends": { y: 2, x0: 1, x1: 5, width: 4 },
    "ruley-theme": { y: 3 },
    "rulex-3d": { x: 3 },
    "rulex-pointer3d": { x: "@pointer_x" },
    "callout-one": { x: 3, y: 4, text: "peak" },
    "callout-rows": { x: "value", y: "value", text: "g", dx: -30, dy: 20, color: "g", size: 10 },
    "callout-plain": { x: 2, y: 2, text: "note", box: false, leader: false, align: "left", opacity: 0.6 },
    "callout-theme": { x: 4, y: 3, text: "themed" },
    "densitycontour-basic": { x: "t", y: "v" },
    "densitycontour-styled": { x: "t", y: "v", thresholds: 6, bandwidth: 1.5, color: "#7a36b4", width: 3, opacity: 0.6 },
    "densitycontour-theme": { x: "t", y: "v", resolution: 64 },
    "densitycontour-bandsmode": { x: "t", y: "v", mode: "bands" },
    // The hand-written bands were DensityContour's mode="bands" (its copy is given the mode below).
    "densitybands-basic": { x: "t", y: "v" },
    "densitybands-styled": { x: "t", y: "v", thresholds: 4, fill: "#2a6fdb", opacity: 0.5, outlineColor: "#e4572e", outlineWidth: 2 },
    "densitybands-theme": { x: "t", y: "v" },
    "errorbars-vertical": { x: "g", y: "m", lower: "lo", upper: "hi" },
    "errorbars-horizontal": { x: "m", y: "g", lower: "lo", upper: "hi", orientation: "horizontal", capSize: 10, color: "#e4572e", width: 3 },
    "errorbars-position": { position: [[1, 2], [2, 3], [3, 1], [4, 2]], lower: [1, 2, 0.5, 2], upper: [3, 4, 1.5, 1], color: "#1aa340" },
    "errorbars-scalar": { x: "t", y: "m", lower: 0, upper: "hi", opacity: 0.5, capSize: 0 },
    "errorbars-theme": { x: "t", y: "m", lower: "lo", upper: "hi" },
    "lollipop-vertical": { x: "region", y: "sales", fill: "#e4572e", stem: { color: "#2a6fdb", width: 3 } },
    "lollipop-horizontal": { x: "sales", y: "region", size: 9 },
    "lollipop-baseline": { x: "region", y: "sales", baseline: 2.5, opacity: 0.6 },
    "lollipop-column": { x: "region", y: "sales", baseline: "floor", fill: "product" },
    "lollipop-numeric": { x: "t", y: "v", baseline: 2 },
    "lollipop-orientation": { x: "t", y: "v", orientation: "horizontal" },
    "lollipop-theme": { x: "region", y: "sales" },
    "boxplot-vertical": { x: "g", y: "value" },
    "boxplot-horizontal": { x: "value", y: "g", outlierSize: 5, whisker: 0.5 },
    "boxplot-styled": { x: "g", y: "value", fill: "#e4572e", outlineColor: "#1aa340", outlineWidth: 2, bandFraction: 0.5, whisker: 0.5 },
    "boxplot-nooutliers": { x: "g", y: "value", whisker: 0.5, outliers: false, opacity: 0.6 },
    "boxplot-theme": { x: "g", y: "value", whisker: 0.5 },
    "violin-vertical": { x: "g", y: "value" },
    "violin-horizontal": { x: "value", y: "g", fill: "#e4572e", outlineColor: "#2a6fdb", outlineWidth: 2 },
    "violin-orientation": { x: "value", y: "g", orientation: "horizontal", opacity: 0.6, outlineOpacity: 0.4 },
    "violin-half": { x: "g", y: "value", side: "left", scale: "count", bandFraction: 0.6 },
    "violin-bandwidth": { x: "g", y: "value", bandwidth: 0.5, resolution: 64, scale: "area" },
    "violin-theme": { x: "g", y: "value" },
    "errorbars-mapping": { lower: "lo", upper: "hi", capSize: 8 },
    "pie-basic": { value: "sales", category: "region" },
    "pie-donut": { value: "sales", category: "region", innerRadius: 0.55, padAngle: 1.5, sectorLabel: "category" },
    "pie-percent": { value: "sales", category: "region", sectorLabel: "percent", sort: "desc", opacity: 0.7 },
    "pie-sunburst": { value: "sales", category: "region", by: "ring", padAngle: 2, sectorLabel: "value", textColor: "#000000", fontSize: 10 },
    "pie-half": { value: "sales", category: "region", startAngle: -90, endAngle: 90, fill: "#2a6fdb", outlineColor: "#ffffff", outlineWidth: 2 },
    "pie-polar": { value: "sales", category: "region", sectorLabel: "percent" },
    "pie-theme": { value: "sales", category: "region", sectorLabel: "category" },
    "errorbars-log": { x: "t", y: "m", lower: [0, 1, 2, 3], upper: "hi" },
    "errorbars-polar": { x: "t", y: "m", lower: "lo", upper: "hi", width: 2 },
  };
  // The legacy fixture retains its old style keywords for before/after rendering parity.
  const initial = legacy && mark === "lollipop"
    ? (({ stem, ...props }) => ({ ...props, stemColor: stem?.color, stemWidth: stem?.width }))(cases[name])
    : cases[name];
  let props = $state(legacy && mark === "densitybands" ? { ...initial, mode: "bands" } : initial);
  let plot = $state(), handle = $state();
  let plotType = $state(name.endsWith("3d") ? "3d" : "2d");
  const theme = { "ecdf-theme": { marks: { Ecdf: { color: "#ff00ff", width: 5 } } }, "bar-theme": { marks: { Bar: { fill: "#ff00ff", opacity: 0.7 } } },
    "histogram-theme": { marks: { Histogram: { fill: "#ff00ff", opacity: 0.7 } } },
    "swarm-theme": { marks: { Swarm: { color: "#ff00ff", size: 9 } } },
    "smooth-theme": { marks: { Smooth: { color: "#ff00ff", width: 4, fill: "#00aaff", opacity: 0.5 } } },
    "ruley-theme": { marks: { RuleY: { color: "#ff00ff", width: 3, opacity: 0.6, size: 9 } } },
    "callout-theme": { marks: { Callout: { color: "#ff00ff", size: 16, opacity: 0.7, width: 9 } } },
    "errorbars-theme": { marks: { ErrorBars: { color: "#ff00ff", width: 4, capSize: 12, opacity: 0.6 } } },
    "boxplot-theme": { marks: { BoxPlot: { fill: "#ff00ff", outlineColor: "#00aaff", outlineWidth: 3 }, ErrorBars: { width: 3, opacity: 0.5 } } },
    "violin-theme": { marks: { Violin: { fill: "#ff00ff", opacity: 0.7, outlineColor: "#00aaff", outlineWidth: 3 } } },
    "lollipop-theme": { marks: { Lollipop: { color: "#ff00ff", width: 4, size: 12, opacity: 0.7 } } },
    "pie-theme": { marks: { Pie: { outlineColor: "#ff00ff", outlineWidth: 3, opacity: 0.6 } } },
    "densitycontour-theme": { marks: { DensityContour: { color: "#ff00ff", width: 4, fill: "#00aaff" } } },
    // The bands' theme kind was DensityContour's.
    "densitybands-theme": { marks: { [legacy ? "DensityContour" : "DensityBands"]: { outlineColor: "#ff00ff", outlineWidth: 3, opacity: 0.5, width: 9 } } } }[name] ?? {};
  onMount(() => {
    window.templateParity = {
      get plot() { return plot; }, get mark() { return handle; },
      set(next) { props = { ...props, ...next }; },
      setType(next) { plotType = next; },
    };
    return () => { delete window.templateParity; };
  });
</script>

<!-- Fixed Callout gutters isolate mark parity from the layout solver's mount-order history.
     Automatic gutters and their settlement have dedicated plot-layout browser coverage. -->
<Theme value={mark === "callout" ? { ...theme, axes: { marginLeft: 48, marginRight: 8, marginTop: 8, marginBottom: 48 } } : theme}>
  <Plot bind:this={plot} type={plotType} width={320} height={240} data={mark === "bar" || (mark === "lollipop" && !/numeric|orientation/.test(name)) ? sales : mark === "smooth" || /lollipop-(numeric|orientation)/.test(name) || mark.startsWith("density") ? trend : mark === "errorbars" ? intervals : mark === "pie" ? pies : samples} colorScale={palette} fillScale={mark === "pie" ? regions : products}
  {...name === "errorbars-log" ? { y: { transform: "log" } } : name === "errorbars-polar" || name === "pie-polar" ? { coordinates: "polar" } : {}}>
    <!-- Points give rules (which never widen domains) and callouts a frame. -->
    {#if mark.startsWith("rule") || mark === "callout"}<Points x="value" y="value" size={4} color="#2a6fdb" />{/if}
    {#if name === "errorbars-mapping"}<Mapping x="g" y="m"><Impl bind:this={handle} {...props} /></Mapping>
    {:else}<Impl bind:this={handle} {...props} />{/if}
    {#if name === "ecdf-legend"}<Legend for={handle} channel="color" position="right" />{/if}
  </Plot>
</Theme>
