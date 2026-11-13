<script lang="ts">
  // A compound mark written only with the composition surface: a stem from the baseline to
  // each value (ErrorBars without caps) and a head (Points) at the value.
  import { ErrorBars, Points, ThemeDefaults, DATA_CONTEXT, categoryField, minimum, maximum, isAnimate, AXIS_NAMES_CONTEXT, channelTitle } from "$lib/plot/composition.js";
  import type { LollipopProps } from "$lib/plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  let { x, y, z = undefined, orientation = undefined, baseline = 0, stemColor = undefined, stemWidth = undefined, size = undefined, name, ...props }: Omit<LollipopProps, "stemColor" | "stemWidth"> & { stemColor?: string; stemWidth?: number } = $props();
  const data: any = getContext(DATA_CONTEXT);
  // A categorical y against a numeric x lays the stems along x, as Bar and BoxPlot detect it;
  // two numeric axes are a vertical stem plot.
  const horizontal = $derived.by(() => {
    if (orientation) return orientation === "horizontal";
    let scope;
    try { scope = data?.read(); } catch { return false; }
    const cx = categoryField(scope, x), cy = categoryField(scope, y);
    return Boolean(cy && !cx);
  });
  const value = $derived(horizontal ? x : y);
  // ErrorBars drops reversed intervals, so the stem's ends are sorted: a value below the
  // baseline still gets a stem. An animate() on the value moves the heads per row; the stems
  // follow it with the implicit transition, timed the same way.
  const target = $derived(isAnimate(value) ? value.value : value);
  const stemAnimation = $derived(isAnimate(value)
    ? { animation: true, animationDuration: value.duration ?? props.animationDuration, animationEasing: value.easing ?? props.animationEasing }
    : {});
  // What the mark as a whole is told applies to both parts: visibility, opacity, identity,
  // selection response, enter/exit and the animation switch.
  const SHARED = ["visible", "opacity", "respond", "selectionOpacity", "identity", "enterEffect", "exitEffect", "animation", "animationDuration", "animationEasing"];
  const shared = $derived.by(() => {
    const out: Record<string, any> = {};
    for (const key of SHARED) if (props[key] !== undefined) out[key] = props[key];
    // The heads produce selections (select, brush, nearby); the stems respond to them as the
    // heads do (hover fades neither by default, TODO 62.2).
    if (out.respond === undefined) {
      const produced = Object.entries({ select: "selected", brush: "brushed", nearby: "nearby" })
        .filter(([key]) => props[key])
        .map(([key, response]) => (props[key]?.isSelection ? props[key] : props[key]?.selection?.isSelection ? props[key].selection : response));
      if (produced.length) out.respond = produced;
    }
    return out;
  });
  // Axis titles: the category and value columns (the stems' ends are derived expressions).
  setContext(AXIS_NAMES_CONTEXT, () => {
    let scope;
    try { scope = data?.read(); } catch { return {}; }
    return { x: channelTitle(scope, x), y: channelTitle(scope, y), z: channelTitle(scope, z) };
  });
  let head = $state<any>(), headVisible = $state(true);
  // One legend entry: toggling the heads there hides the stems too.
  $effect(() => head?.subscribeSettings?.((values) => { headVisible = values.visible !== false; }));
  export const getLegendSource = () => head?.getLegendSource();
  export const getMark = () => head?.getMark();
</script>

<ThemeDefaults kind="Lollipop" defaults={{ color: "#8a949e", width: 1.5 }} values={{ color: stemColor, width: stemWidth }} only={["color", "width", "opacity"]}>
  <ErrorBars name={name ? `${name} stems` : undefined} {x} {y} {z}
    lower={minimum(baseline, target)} upper={maximum(baseline, target)} orientation={horizontal ? "horizontal" : "vertical"}
    capSize={0} legend={false} {...stemAnimation} {...shared} visible={shared.visible === false ? false : headVisible} />
</ThemeDefaults>
<ThemeDefaults kind="Lollipop" defaults={{ size: 5 }} values={{ size }} except={["color", "width"]}>
  <Points bind:this={head} {name} {x} {y} {z} {...props} />
</ThemeDefaults>
