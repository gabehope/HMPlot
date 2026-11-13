<script lang="ts">
  // A copy of the hand-written Rule that RuleX, RuleY and Crosshair drew with before they became
  // templates (TODO 130.3), for their legacy copies.
  // A rule (TODO 45; RuleX, RuleY and Crosshair, through composition.js): the line where x (or y)
  // is constant, across the frame's visible domain in the other dimension or between the given ends. It is a Segments from one end to the other,
  // which follows the frame chain: a vertical line in a Cartesian frame, a spoke or a circle in a
  // polar one, a meridian or a parallel on a map or a globe (angular interpolation: a parallel is
  // not a great circle). One per row, or one for a value that reads no column (a constant,
  // @pointer_x). Rules never widen automatic domains.
  import Segments from "$lib/plot/bound/segments.svelte";
  import ThemeDefaults from "$lib/plot/themeDefaults.svelte";
  import { planeRule } from "$lib/plot/utils/planeRule.svelte.js";
  import { untrack } from "svelte";
  let { dimension, value, from = undefined, to = undefined, color = undefined, width = undefined, dash = undefined,
    name = undefined, kind, defaults = {}, ...props }: any = $props();
  const other = $derived(dimension === "x" ? "y" : "x");
  const start = $derived(from ?? `@view_${other}_min`), end = $derived(to ?? `@view_${other}_max`);
  const dashed = $derived(dash === undefined || dash === false ? {} : Array.isArray(dash)
    ? { dashed: true, dashSize: dash[0], gapSize: dash[1] } : { dashed: true, dashSize: typeof dash === "number" ? dash : 4, gapSize: typeof dash === "number" ? dash : 4 });
  // x = c is a plane in a 3D Cartesian view (utils/planeRule.svelte.js).
  const guard = untrack(() => planeRule(kind, dimension, () => value));
  const ends = $derived(dimension === "x" ? { start: [value, start], end: [value, end] } : { start: [start, value], end: [end, value] });
</script>

{#if guard.drawn}
<ThemeDefaults {kind} defaults={{ color: "#8a949e", width: 1, ...defaults }} values={{ color, width }} only={["color", "width", "opacity"]}>
  <!-- A value or an end that reads a column draws a rule per row; anything else (a number, a
    time, the pointer, an expression over view state) draws one (rows="auto"). -->
  <Segments {name} {...ends} interpolation="angular" legend={false} domains={false} rows="auto" {...dashed} {...props} />
</ThemeDefaults>
{/if}
