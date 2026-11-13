<script lang="ts">
  import { Transform, Prism, ThemeDefaults, DATA_CONTEXT, categoryField, ENDPOINT_COMPOUND_CONTEXT, endpointDescriptor } from "$lib/plot/composition.js";
  import type { BarProps } from "$lib/plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  let { x, y, orientation = undefined, baseline = 0, bandFraction = 0.8, arrange = undefined, name, ...props }: BarProps = $props();
  let transform = $state<any>(), mark = $state<any>();
  // The bar's share of its band is bandFraction (R2.0); a width would draw over it.
  $effect.pre(() => { if ((props as any).width !== undefined) throw Error("Bar.width is not a prop: bandFraction sets the bar's share of its band."); });
  const markProps: any = $derived(props);
  const data: any = getContext(DATA_CONTEXT);
  const horizontal = $derived.by(() => {
    if (orientation) return orientation === "horizontal";
    const scope = data?.read(), cx = categoryField(scope, x), cy = categoryField(scope, y);
    if (cx === cy) throw Error("Bar needs exactly one categorical position axis or an explicit orientation.");
    return cy;
  });
  // Bars that share a category (TODO 133.2): stacked by default, from zero; a baseline places
  // each bar by hand, so it overlaps unless asked. The series is the column fill (or color)
  // names: its order stacks them, and each gets the same slot in every category when grouped.
  // BarGeometry checks a stack's baseline and reads a series naming no column (a color) as none.
  const arrangement = $derived(arrange ?? (baseline === 0 ? "stack" : "overlap"));
  const series = $derived((props as any).fill ?? (props as any).color);
  const grouped = $derived(arrangement === "group");
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
  export const whenSettled = () => transform?.whenSettled();
  // Connections: the Prism registers as this Bar's endpoint (its name; value and baseline ends).
  setContext(ENDPOINT_COMPOUND_CONTEXT, {
    kind: "Bar", markKind: "Prism", name: () => name,
    valueAxis: () => (horizontal ? 0 : 1), columns: { value: "__barValue", baseline: "__barBaseline" },
  });
  const self = { getMark };
  /** This Bar as a connection endpoint: `at` is "center", an edge, "value" or "baseline". */
  export const endpoint = (config: Partial<{ at: string }> = {}) =>
    endpointDescriptor({ handle: self, at: config.at, kind: "Bar" });
</script>

<!-- BarGeometry's outputs are the same whichever way the bars run: one Prism draws both. -->
<ThemeDefaults kind="Bar"><Transform bind:this={transform} kind="BarGeometry" {x} {y} {orientation} {baseline}
  arrange={arrangement} {series} {bandFraction}>
  <Prism bind:this={mark} x="__barX" y="__barY" width="__barSizeX" depth="__barSizeY"
    xOffset={grouped ? "__barOffsetX" : undefined} yOffset={grouped ? "__barOffsetY" : undefined} z0={0} z1={0} axis="z" {...markProps} />
</Transform></ThemeDefaults>
