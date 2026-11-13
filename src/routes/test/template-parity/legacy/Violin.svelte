<script lang="ts">
  // A copy of the hand-written Violin before it became a template (TODO 130.3), for parity.
  import { Density, Area, Anchor, ThemeDefaults, DATA_CONTEXT, categoryField, AXIS_NAMES_CONTEXT, channelTitle } from "$lib/plot/composition.js";
  import type { ViolinProps } from "$lib/plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  let { x, y, orientation = undefined, scale = "width", side = "both", bandwidth = "auto", resolution = 256, bandFraction = 0.8, fill = undefined, opacity = undefined, outlineColor = undefined, outlineWidth = undefined, outlineOpacity = undefined, name, ...props }: ViolinProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  // The violin's share of its band is bandFraction (R2.0); a width would draw over it.
  $effect.pre(() => { if ((props as any).width !== undefined) throw Error("Violin.width is not a prop: bandFraction sets the violin's share of its band."); });
  const horizontal = $derived.by(() => {
    if (orientation) return orientation === "horizontal";
    const scope = data?.read(), cx = categoryField(scope, x), cy = categoryField(scope, y);
    if (cx === cy) throw Error("Violin needs exactly one categorical position axis or an explicit orientation.");
    return cy;
  });
  const category = $derived(horizontal ? y : x), measurement = $derived(horizontal ? x : y);
  // Its bands brush along the measurement axis (a Ribbon brushes along its positions).
  $effect.pre(() => { const axis = (props as any).brush?.axis, along = horizontal ? "x" : "y"; if (axis !== undefined && axis !== along) throw Error(`A ${horizontal ? "horizontal" : "vertical"} Violin brushes along its measurement axis, ${along}: use brush={{ axis: "${along}" }}.`); });
  // Axis titles: the category and measurement columns, not the density's columns.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, x), y: channelTitle(scope, y) }; });
  let transform = $state<any>(), mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
  export const whenSettled = () => transform?.whenSettled();
</script>

<ThemeDefaults kind="Violin" defaults={{fill:"#547ba2",opacity:0.35,outlineColor:"#30343b",outlineWidth:1}} values={{fill,opacity,outlineColor,outlineWidth,outlineOpacity}}><Density bind:this={transform} x={measurement as string} by={category as string} {bandwidth} {resolution} violin={{ scale, width: bandFraction, side, orientation: horizontal ? "horizontal" : "vertical" }}>
  <Area bind:this={mark} {...(horizontal ? { x: "x" } : { orientation: "horizontal", y: "x" })} lower="__violinLower" upper="__violinUpper" {...props} />
  {#if horizontal}<Anchor x="x" y={category} />
  {:else}<Anchor x={category} y="x" />{/if}
</Density></ThemeDefaults>
