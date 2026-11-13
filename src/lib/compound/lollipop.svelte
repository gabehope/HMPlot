<script lang="ts">
  import { Transform, ThemeDefaults, Segments, Points, DATA_CONTEXT, MAPPING_CONTEXT, categoryField, isAnimate, AXIS_NAMES_CONTEXT, channelTitle } from "../plot/composition.js";
  import type { LollipopProps } from "../plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./lollipop.js";
  // A template (./lollipop.js): the host expands it; this wrapper settles what the definition
  // cannot read itself: the orientation, an animate() on the value, and what the stems share
  // with the heads.
  let own: LollipopProps = $props();
  // An enclosing Mapping's positions place the lollipops, as they did the heads: its layers fill
  // the x, y and z the caller leaves out.
  const mapping: any = getContext(MAPPING_CONTEXT);
  const chart = $derived.by(() => {
    const given: Record<string, unknown> = {};
    for (const layer of mapping?.read() ?? []) for (const key of ["x", "y", "z"]) if (layer[key] !== undefined) given[key] = layer[key];
    for (const key of ["x", "y", "z"] as const) if (own[key] !== undefined) delete given[key];
    return { ...given, ...own } as LollipopProps;
  });
  $effect.pre(() => {
    if (chart.x === undefined || chart.y === undefined)
      throw Error("Lollipop needs x and y: each head's position and value (one of them categorical lays the stems along the other).");
  });
  const data: any = getContext(DATA_CONTEXT);
  // A categorical y against a numeric x lays the stems along x, as Bar and BoxPlot detect it;
  // two numeric axes are a vertical stem plot.
  const horizontal = $derived.by(() => {
    if (chart.orientation) return chart.orientation === "horizontal";
    let scope;
    try { scope = data?.read(); } catch { return false; }
    return Boolean(categoryField(scope, chart.y) && !categoryField(scope, chart.x));
  });
  // What the mark as a whole is told applies to both parts: opacity, identity, selection
  // response, enter/exit and the animation switch. The stems follow the heads' visibility.
  const SHARED = ["opacity", "respond", "selectionOpacity", "identity", "enterEffect", "exitEffect", "animation", "animationDuration", "animationEasing"];
  const hosted = $derived.by(() => {
    const stem: Record<string, any> = {};
    for (const key of SHARED) if (chart[key] !== undefined) stem[key] = chart[key];
    // The heads produce selections (select, brush, nearby); the stems respond to them as the
    // heads do (hover fades neither by default, TODO 62.2).
    if (stem.respond === undefined) {
      const produced = Object.entries({ select: "selected", brush: "brushed", nearby: "nearby" })
        .filter(([key]) => chart[key])
        .map(([key, response]) => (chart[key]?.isSelection ? chart[key] : chart[key]?.selection?.isSelection ? chart[key].selection : response));
      if (produced.length) stem.respond = produced;
    }
    // An animate() on a position moves the heads per row, along BarGeometry's tip column (or the
    // z column); the stems follow it with the implicit transition, timed the same way.
    const unwrapped: Record<string, unknown> = {}, heads: Record<string, unknown> = {};
    for (const axis of ["x", "y", "z"] as const) {
      const value = chart[axis];
      if (!isAnimate(value)) continue;
      unwrapped[axis] = value.value;
      heads[`_head${axis.toUpperCase()}`] = { ...value, value: axis === "z" ? value.value : `__barTip${axis.toUpperCase()}` };
      Object.assign(stem, { animation: true, animationDuration: value.duration ?? chart.animationDuration, animationEasing: value.easing ?? chart.animationEasing });
    }
    // `stem` that is not an object reaches the host, which names the fix.
    const part = chart.stem && typeof chart.stem === "object" && !Array.isArray(chart.stem) ? { ...stem, ...chart.stem } : chart.stem ?? stem;
    return { ...chart, ...unwrapped, orientation: horizontal ? "horizontal" : "vertical", ...heads, stem: part };
  });
  // Axis titles: the category and value columns (the parts read BarGeometry's columns).
  setContext(AXIS_NAMES_CONTEXT, () => {
    let scope;
    try { scope = data?.read(); } catch { return {}; }
    return { x: channelTitle(scope, chart.x), y: channelTitle(scope, chart.y), z: channelTitle(scope, chart.z) };
  });
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

<TemplateHost {definition} parts={{ Transform, ThemeDefaults, Segments, Points }} props={hosted} bind:this={host} />
