<script lang="ts">
  // A template (./pie.js): the host expands it; this wrapper settles what reads the plot: the
  // frame's angle units and view, the label's column and size, what the labels share with the
  // sectors, and the pie's own polar Frame in a Cartesian plot.
  import { Transform, Rect, Text, Frame, DATA_CONTEXT, VIEW_CONTEXT, categoryField, getOptionsContext, AXIS_NAMES_CONTEXT } from "../plot/composition.js";
  import type { PieProps } from "../plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./pie.js";
  let props: PieProps = $props();
  const data: any = getContext(DATA_CONTEXT), view: any = getContext(VIEW_CONTEXT);
  const options: any = getOptionsContext();
  const coordinates = options.store("coordinates"), angleUnit = options.store("angleUnit"),
    anglePeriod = options.store("anglePeriod");
  // The plot's 2D or 3D view (its view context, TODO 136.12).
  const viewMode = $derived(view?.mode?.() ?? "2d");
  const polar = $derived($coordinates === "polar");
  // The frame's angle units per turn. A Pie's own Frame reads degrees. An "extent" unit's turn
  // follows the x domain, which the pie's own angles would move: PieGeometry reports it.
  const turn = $derived(!polar ? 360 : $angleUnit === "radians" ? 2 * Math.PI
    : $angleUnit === "custom" ? $anglePeriod : $angleUnit === "extent" ? "extent" : 360);
  // The text: a categorical column as it is; value, percent and numbers formatted by PieGeometry.
  const scope = () => { try { return data?.read(); } catch { return undefined; } };
  const text = $derived.by(() => {
    const label = props.sectorLabel;
    if (label === undefined) return undefined;
    if (label === "category") return props.category;
    if (label === "value" || label === "percent" || typeof label !== "string") return "__pieLabel";
    return categoryField(scope(), label) ? label : "__pieLabel";
  });
  // Labels that would overlap a larger sector's are hidden (TODO 134.28): PieGeometry needs the
  // font size in radius units, from the sectors' frame as drawn (the polar Rect measures it each
  // frame: a fitted or placed Frame, an inset, a ranged Frame or another y domain). It is rounded
  // to a power of 1.25, so resizing reruns the geometry only when the size changes by a step.
  let perUnit = $state(0);
  $effect(() => host?.getMark()?.watchPixelsPerUnit?.((value: number) => { perUnit = value; }));
  const labelSize = $derived(text === undefined || !(perUnit > 0) ? undefined
    : 1.25 ** Math.round(Math.log((props.fontSize ?? 12) / perUnit) / Math.log(1.25)));
  // The own Frame's angles (degrees, counter-clockwise from east) span the pie's: marks outside
  // a polar frame's angle domain are clipped.
  const angles = $derived.by((): [number, number] => {
    const start = props.startAngle ?? 0, end = props.endAngle ?? 360;
    const lo = Math.min(start, end), hi = Math.max(start, end);
    return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [90 - Math.min(hi, lo + 360), 90 - lo] : [-270, 90];
  });
  // Placed in a Cartesian frame: where `placement` puts it, else fitted (centered in the frame's
  // domain, across 90% of its shorter side).
  const placed = $derived(props.placement ?? "fit");
  $effect.pre(() => {
    const placement: any = props.placement;
    if (placement !== undefined && (placement?.anchor === undefined || placement?.size === undefined))
      throw Error("Pie.placement needs both anchor and size: leave it out to fit the pie to the plot.");
  });
  // What the Pie as a whole is told applies to its labels too: opacity, identity, selection
  // response, enter/exit and animation. The labels follow the sectors' visibility.
  const SHARED = ["opacity", "respond", "selectionOpacity", "identity", "enterEffect", "exitEffect", "animation", "animationDuration", "animationEasing"];
  const hosted = $derived.by(() => {
    const chart: Record<string, any> = props;
    const labels: Record<string, any> = {};
    for (const key of SHARED) if (chart[key] !== undefined) labels[key] = chart[key];
    // The sectors produce selections (select); the labels respond to them as the sectors do
    // (hover fades neither by default, TODO 62.2).
    if (labels.respond === undefined) {
      const produced = Object.entries({ select: "selected", brush: "brushed", nearby: "nearby" })
        .filter(([key]) => chart[key])
        .map(([key, response]) => (chart[key]?.isSelection ? chart[key] : chart[key]?.selection?.isSelection ? chart[key].selection : response));
      if (produced.length) labels.respond = produced;
    }
    return {
      ...props, _turn: turn, _view: viewMode, _label: text === "__pieLabel" ? props.sectorLabel : undefined,
      _labelText: text, _labelSize: labelSize, _labels: labels,
    };
  });
  // Axis titles: the sectors' angles and radii are not the user's columns.
  setContext(AXIS_NAMES_CONTEXT, () => ({ x: null, y: null }));
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
  /** This Pie as a connection endpoint: `at` is "center" (a sector's centroid), "outer" or "inner", or a polar box edge ("left", "right": its start and end edges). */
  export const endpoint = (config: Partial<{ at: string }> = {}) => host.endpointOf(config);
</script>

{#snippet body()}
  <TemplateHost {definition} parts={{ Transform, Rect, Text }} props={hosted} bind:this={host} />
{/snippet}

{#if polar}
  {@render body()}
{:else}
  <Frame coordinates="polar" placement={placed} x={{ domain: angles, visible: false }} y={{ domain: [0, 1], visible: false }}>
    {@render body()}
  </Frame>
{/if}
