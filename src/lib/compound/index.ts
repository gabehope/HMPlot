// Compound authoring compatibility entry. Charts are public through hmplot/charts;
// this subpath also carries the experimental authoring surface.
export { default as Histogram } from "./histogram.svelte";
export { default as Violin } from "./violin.svelte";
export { default as BoxPlot } from "./boxPlot.svelte";
export { default as Swarm } from "./swarm.svelte";
export { default as Bar } from "./bar.svelte";
export { default as Lollipop } from "./lollipop.svelte";
export { default as Pie } from "./pie.svelte";
export { default as RuleX } from "./ruleX.svelte";
export { default as RuleY } from "./ruleY.svelte";
export { default as Crosshair } from "./crosshair.svelte";
export { default as Callout } from "./callout.svelte";
export { default as Smooth } from "./smooth.svelte";
export { default as Ecdf } from "./ecdf.svelte";
export { default as DensityContour } from "./densityContour.svelte";
export { default as DensityBands } from "./densityBands.svelte";
export { default as ErrorBars } from "./errorBars.svelte";
export type { HistogramProps, ViolinProps, BoxPlotProps, SwarmProps, BarProps, LollipopProps, PieProps, RuleXProps, RuleYProps, CrosshairProps, CalloutProps, SmoothProps, EcdfProps, DensityContourProps, DensityBandsProps, ErrorBarsProps } from "../plot/publicTypes.js";
/**
 * Building blocks for writing a pattern in Svelte (Transform, data-bound primitives, contexts).
 * @experimental Names and behavior may change between minor releases.
 */
export * as composition from "../plot/composition.js";
