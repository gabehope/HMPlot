<script lang="ts">
  // A pie or donut: the PieGeometry transform turns each row's value into a sector (angles and
  // radii), a Rect draws the sectors (a polar frame makes them annular sectors) and a Text the
  // text at each centroid. In a polar frame the pie fills the disk; in a Cartesian one it places
  // a polar Frame of its own.
  import { Transform, Rect, Text, Frame, ThemeDefaults, DATA_CONTEXT, VIEW_CONTEXT, categoryField, getOptionsContext, ENDPOINT_COMPOUND_CONTEXT, endpointDescriptor, AXIS_NAMES_CONTEXT } from "$lib/plot/composition.js";
  import type { PieProps } from "$lib/plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  let { value, category = undefined, by = undefined, sort = "none", startAngle = 0, endAngle = 360, padAngle = 0,
    innerRadius = 0, outerRadius = 1, sectorLabel = undefined, sectorLabelFormat = undefined, textColor = undefined,
    fontSize = undefined, placement = undefined, fill = undefined, name, ...props }: PieProps = $props();
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
    if (sectorLabel === undefined) return undefined;
    if (sectorLabel === "category") return category;
    if (sectorLabel === "value" || sectorLabel === "percent" || typeof sectorLabel !== "string") return "__pieLabel";
    return categoryField(scope(), sectorLabel) ? sectorLabel : "__pieLabel";
  });
  // Labels that would overlap a larger sector's are hidden (TODO 134.28): PieGeometry needs the
  // font size in radius units, from the sectors' frame as drawn (the polar Rect measures it each
  // frame: a fitted or placed Frame, an inset, a ranged Frame or another y domain). It is rounded
  // to a power of 1.25, so resizing reruns the geometry only when the size changes by a step.
  let perUnit = $state(0);
  $effect(() => mark?.getMark?.()?.watchPixelsPerUnit?.((value: number) => { perUnit = value; }));
  const labelSize = $derived(text === undefined || !(perUnit > 0) ? undefined
    : 1.25 ** Math.round(Math.log((fontSize ?? 12) / perUnit) / Math.log(1.25)));
  // The own Frame's angles (degrees, counter-clockwise from east) span the pie's: marks outside
  // a polar frame's angle domain are clipped.
  const angles = $derived.by((): [number, number] => {
    const lo = Math.min(startAngle, endAngle), hi = Math.max(startAngle, endAngle);
    return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [90 - Math.min(hi, lo + 360), 90 - lo] : [-270, 90];
  });
  // Placed in a Cartesian frame: where `placement` puts it, else fitted (centered in the frame's
  // domain, across 90% of its shorter side).
  const placed = $derived(placement ?? "fit");
  $effect.pre(() => { if (placement !== undefined && (placement?.anchor === undefined || placement?.size === undefined)) throw Error("Pie.placement needs both anchor and size: leave it out to fit the pie to the plot."); });
  let transform = $state<any>(), mark = $state<any>();
  const markProps: any = $derived(props);
  // What the Pie as a whole is told applies to its labels too: visibility, opacity, identity,
  // selection response, enter/exit and animation.
  const SHARED = ["visible", "opacity", "respond", "selectionOpacity", "identity", "enterEffect", "exitEffect", "animation", "animationDuration", "animationEasing"];
  const shared = $derived.by(() => {
    const out: Record<string, any> = {};
    for (const key of SHARED) if (props[key] !== undefined) out[key] = props[key];
    // The sectors produce selections (select); the labels respond to them as the sectors do
    // (hover fades neither by default, TODO 62.2).
    if (out.respond === undefined) {
      const produced = Object.entries({ select: "selected", brush: "brushed", nearby: "nearby" })
        .filter(([key]) => props[key])
        .map(([key, response]) => (props[key]?.isSelection ? props[key] : props[key]?.selection?.isSelection ? props[key].selection : response));
      if (produced.length) out.respond = produced;
    }
    return out;
  });
  // One legend entry: hiding the sectors there hides their labels.
  let sectorsVisible = $state(true);
  $effect(() => mark?.subscribeSettings?.((values) => { sectorsVisible = values.visible !== false; }));
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
  export const whenSettled = () => transform?.whenSettled();
  // Connections: the Rect registers as this Pie's endpoint: "center" (the centroid), "outer"
  // and "inner" (the middle of the sector's outer and inner arcs).
  setContext(ENDPOINT_COMPOUND_CONTEXT, { kind: "Pie", markKind: "Rect", name: () => name, valueAxis: () => 0, columns: {} });
  // Axis titles: the sectors' angles and radii are not the user's columns.
  setContext(AXIS_NAMES_CONTEXT, () => ({ x: null, y: null }));
  const self = { getMark };
  /** This Pie as a connection endpoint: `at` is "center" (a sector's centroid), "outer" or "inner". */
  export const endpoint = (config: Partial<{ at: string }> = {}) =>
    endpointDescriptor({ handle: self, at: config.at, kind: "Pie" });
</script>

{#snippet body()}
  <ThemeDefaults kind="Pie"><Transform bind:this={transform} kind="PieGeometry" {value} {category} {by} {sort}
    {startAngle} {endAngle} {padAngle} {innerRadius} {outerRadius} {turn} view={viewMode}
    label={text === "__pieLabel" ? sectorLabel : undefined} labelFormat={sectorLabelFormat}
    labelText={text} {labelSize}>
    <Rect bind:this={mark} {name} x0="__pieStart" x1="__pieEnd" y0="__pieInner" y1="__pieOuter"
      fill={fill ?? category} {...markProps} />
    {#if text !== undefined}
      <Text x="__pieAngle" y="__pieTextRadius" text={text} color={textColor ?? "#ffffff"} size={fontSize ?? 12}
        legend={false} name={name ? `${name} labels` : undefined} {...shared}
        visible={shared.visible === false ? false : sectorsVisible} />
    {/if}
  </Transform></ThemeDefaults>
{/snippet}

{#if polar}
  {@render body()}
{:else}
  <Frame coordinates="polar" placement={placed} x={{ domain: angles, visible: false }} y={{ domain: [0, 1], visible: false }}>
    {@render body()}
  </Frame>
{/if}
