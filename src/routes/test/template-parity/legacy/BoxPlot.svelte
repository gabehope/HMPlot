<script lang="ts">
  import { Transform, Rect, ErrorBars, Segments, Points, ThemeDefaults, DATA_CONTEXT, categoryField, ENDPOINT_COMPOUND_CONTEXT, endpointDescriptor, AXIS_NAMES_CONTEXT, channelTitle } from "$lib/plot/composition.js";
  import type { BoxPlotProps } from "$lib/plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  let { x, y, orientation = undefined, bandFraction = 0.8, whisker = 1.5, outliers = true, outlierSize = 2.5, fill = undefined, outlineColor = undefined, outlineWidth = undefined, outlineOpacity = undefined, name, ...props }: BoxPlotProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  // The box's share of its band is bandFraction (R2.0); a width would draw over it.
  $effect.pre(() => { if ((props as any).width !== undefined) throw Error("BoxPlot.width is not a prop: bandFraction sets the box's share of its band."); });
  const horizontal = $derived.by(() => {
    if (orientation) return orientation === "horizontal";
    const scope = data?.read(), cx = categoryField(scope, x), cy = categoryField(scope, y);
    if (cx === cy) throw Error("BoxPlot needs exactly one categorical position axis or an explicit orientation.");
    return cy;
  });
  const category = $derived(horizontal ? y : x), measurement = $derived(horizontal ? x : y);

  let stats = $state<any>(), outlierTransform = $state<any>(), mark = $state<any>(), boxVisible = $state(true);
  const markProps: any = $derived(props);
  // The box is the BoxPlot's mark (its legend entry, getMark()): hiding it, by the prop, the
  // legend or the mark's options, hides the whiskers, medians and outliers too (TODO 69.7).
  $effect(() => mark?.subscribeSettings?.((values) => { boxVisible = values.visible !== false; }));
  const partsVisible = $derived(markProps.visible === false ? false : boxVisible);
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
  // Connections: the box Rect registers as this BoxPlot's endpoint. "q1"/"q3" are the box's
  // edges on the measurement axis; "median" sits between them at the group's median column.
  setContext(ENDPOINT_COMPOUND_CONTEXT, {
    kind: "BoxPlot", markKind: "Rect", name: () => name,
    valueAxis: () => (horizontal ? 0 : 1),
  });
  // Axis titles: the category and measurement columns, not the box statistics' columns.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, x), y: channelTitle(scope, y) }; });
  const self = { getMark };
  /** This BoxPlot as a connection endpoint: `at` is "center" (the box), "q1", "q3" (its edges on the measurement axis) or "median". */
  export const endpoint = (config: Partial<{ at: string }> = {}) =>
    endpointDescriptor({ handle: self, at: config.at, kind: "BoxPlot" });
  export const whenSettled = async () => { await Promise.all([stats?.whenSettled(), outlierTransform?.whenSettled()]); };
</script>

<ThemeDefaults kind="BoxPlot" defaults={{fill:"#547ba2",outlineColor:"#30343b"}} values={{fill,outlineColor,outlineWidth,outlineOpacity}} aliases={{outlineColor:"color"}}><Transform bind:this={stats} kind="BoxStats" by={category} value={measurement} orientation={horizontal ? "horizontal" : "vertical"} width={bandFraction} {whisker}>
  <Rect bind:this={mark} x0="__boxX0" x1="__boxX1" y0="__boxY0" y1="__boxY1" {...markProps} />
  <ErrorBars position="__boxPosition" lower="whiskerLow" upper="whiskerHigh" orientation={horizontal ? "horizontal" : "vertical"} capSize={8} visible={partsVisible} />
  <Segments start="__medianStart" end="__medianEnd" width={2} visible={partsVisible} />
</Transform></ThemeDefaults>
{#if outliers}
  <ThemeDefaults kind="BoxPlot" defaults={{fill:"#547ba2",outlineColor:"#30343b"}} values={{fill,outlineColor}}><Transform bind:this={outlierTransform} kind="BoxOutliers" by={category} value={measurement} {whisker}>
    <Points {x} {y} size={outlierSize} visible={partsVisible} />
  </Transform></ThemeDefaults>
{/if}
