<script lang="ts">
  import Transform from "../transform.svelte";
  import Raw from "../marks/polygon.svelte";
  import Named from "./namedMark.svelte";
  import { DATA_CONTEXT } from "../utils/categorical.js";
  import { AXIS_NAMES_CONTEXT, channelTitle } from "../utils/axisTitles.js";
  import type { PolygonProps } from "../publicTypes.js";
  import { getContext, setContext, untrack } from "svelte";
  // Filled polygons (TODO 47.4), a core primitive (TODO 130.1). Vertex rows: each group of
  // `series` is a polygon, its rows its vertices in order, triangulated on the host (earcut).
  // Inside a transform that makes triangles (Contour's bands, Voronoi, Hull) it draws those, with
  // no x or y. Either way it draws a filled triangle per row, its corners as Segments' positional
  // channels (start, end, control1), so axes, domains and picking treat them alike.
  let { x = undefined, y = undefined, series = undefined, ...props }: PolygonProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  // Triangle rows (their corner columns, kept through a Filter or a Calculate above).
  const triangles = $derived(x === undefined && y === undefined && Boolean(data?.read()?.has?.("__corner0")));
  // Axis titles: the vertex columns; triangle rows abstain (the marks beside them title the axes).
  setContext(AXIS_NAMES_CONTEXT, () => {
    if (x === undefined && y === undefined) return {};
    const scope = data?.read();
    return { x: channelTitle(scope, x), y: channelTitle(scope, y) };
  });
  const corners = { start: "__corner0", end: "__corner1", control1: "__corner2", edges: "__edges" };
  let transform = $state<any>(), mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  // Vertex rows mount the mark once Triangulate has run, after the settings pane subscribes:
  // listeners attach to whichever mark is mounted, now or later (each with its unsubscribe).
  const listeners = new Map<(change: any) => void, (() => void) | undefined>();
  $effect(() => {
    const current = mark;
    if (!current) return;
    for (const listener of listeners.keys()) listeners.set(listener, current.subscribeSettings?.(listener));
    return () => {
      for (const [listener, stop] of listeners) { stop?.(); listeners.set(listener, undefined); }
    };
  });
  export const subscribeSettings = (listener) => {
    listeners.set(listener, untrack(() => mark)?.subscribeSettings?.(listener));
    return () => { listeners.get(listener)?.(); listeners.delete(listener); };
  };
  export const getMark = () => mark?.getMark();
  export const whenSettled = () => transform?.whenSettled();
</script>

{#if triangles}
  <Named bind:this={mark} component={Raw} kind="Polygon" values={{ ...props, ...corners }} />
{:else}
  <Transform bind:this={transform} kind="Triangulate" {x} {y} {series}>
    <Named bind:this={mark} component={Raw} kind="Polygon" values={{ ...props, ...corners }} />
  </Transform>
{/if}
