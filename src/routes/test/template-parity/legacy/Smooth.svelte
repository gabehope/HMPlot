<script lang="ts">
  // A copy of the hand-written Smooth before it became a template (TODO 130.3), for parity.
  import { Regression, Line, Area, ThemeDefaults, DATA_CONTEXT, AXIS_NAMES_CONTEXT, channelTitle } from "$lib/plot/composition.js";
  import type { SmoothProps } from "$lib/plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  // A fitted curve with its confidence band (TODO 47.1): Regression, then a Ribbon and a Line, as
  // a Violin is a Density and a Ribbon.
  let { x, y, method = "linear", order = undefined, samples = undefined, extent = undefined, band = 0.95,
    color = undefined, width = undefined, fill = undefined, opacity = undefined, name, ...props }: SmoothProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  // Axis titles: the fitted columns, not the Regression's outputs.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, x), y: channelTitle(scope, y) }; });
  let transform = $state<any>(), line = $state<any>(), lineVisible = $state(true);
  // The line is the Smooth's mark (its legend entry, getMark()): hiding it, by the prop, the
  // legend or the mark's options, hides the band too (TODO 69.7).
  $effect(() => line?.subscribeSettings?.((values) => { lineVisible = values.visible !== false; }));
  const bandVisible = $derived((props as any).visible === false ? false : lineVisible);
  export const getLegendSource = () => line?.getLegendSource();
  export const getMark = () => line?.getMark();
  export const whenSettled = () => transform?.whenSettled();
  /** The fit on screen: see Regression's fit(). */
  export const fit = () => transform?.fit() ?? Promise.resolve(null);
</script>

<!-- The theme's Smooth entry: fill and opacity style the band, color and width the line. -->
<Regression bind:this={transform} {x} {y} {method} {order} {samples} {extent} {band}>
  {#if band !== false}
    <ThemeDefaults kind="Smooth" defaults={{ fill: "#547ba2", opacity: 0.25 }} values={{ fill, opacity }} only={["fill", "opacity"]}>
      <Area x="x" lower="lower" upper="upper" legend={false} visible={bandVisible} />
    </ThemeDefaults>
  {/if}
  <ThemeDefaults kind="Smooth" defaults={{ color: "#30343b", width: 2 }} values={{ color, width }} only={["color", "width"]}>
    <Line bind:this={line} x="x" y="y" {...props} />
  </ThemeDefaults>
</Regression>
