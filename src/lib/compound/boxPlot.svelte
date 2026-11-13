<script lang="ts">
  import { Transform, Rect, Segments, Points, ThemeDefaults, DATA_CONTEXT, categoryField, AXIS_NAMES_CONTEXT, channelTitle } from "../plot/composition.js";
  import type { BoxPlotProps } from "../plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./boxPlot.js";
  // A template (./boxPlot.js): the host expands it; this wrapper settles the orientation, which
  // reads the data: the categorical one of x and y is the groups' axis.
  let props: BoxPlotProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  const horizontal = $derived.by(() => {
    if (props.orientation) return props.orientation === "horizontal";
    const scope = data?.read(), cx = categoryField(scope, props.x), cy = categoryField(scope, props.y);
    if (cx === cy) throw Error("BoxPlot needs exactly one categorical position axis or an explicit orientation.");
    return cy;
  });
  const hosted = $derived({
    ...props, orientation: horizontal ? "horizontal" : "vertical",
    _category: horizontal ? props.y : props.x, _measurement: horizontal ? props.x : props.y,
  });
  // Axis titles: the category and measurement columns, not the box statistics' columns.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, props.x), y: channelTitle(scope, props.y) }; });
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
  /** This BoxPlot as a connection endpoint: `at` is "center" (the box), its edges "left", "right", "bottom" and "top", "q1", "q3" (its edges on the measurement axis) or "median". */
  export const endpoint = (config: Partial<{ at: string }> = {}) => host.endpointOf(config);
</script>

<TemplateHost {definition} parts={{ ThemeDefaults, Transform, Rect, Segments, Points }} props={hosted} bind:this={host} />
