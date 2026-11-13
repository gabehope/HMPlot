<script lang="ts">
  import { Density, Area, Anchor, DATA_CONTEXT, categoryField, AXIS_NAMES_CONTEXT, channelTitle } from "../plot/composition.js";
  import type { ViolinProps } from "../plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./violin.js";
  // A template (./violin.js): the host expands it; this wrapper settles the orientation, checks
  // the brush's axis, titles the axes and gives it its parts and handle.
  let props: ViolinProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  const horizontal = $derived.by(() => {
    if (props.orientation) return props.orientation === "horizontal";
    const scope = data?.read(), cx = categoryField(scope, props.x), cy = categoryField(scope, props.y);
    if (cx === cy) throw Error("Violin needs exactly one categorical position axis or an explicit orientation.");
    return cy;
  });
  // Its bands brush along the measurement axis (a Area brushes along its positions).
  $effect.pre(() => { const axis = (props as any).brush?.axis, along = horizontal ? "x" : "y"; if (axis !== undefined && axis !== along) throw Error(`A ${horizontal ? "horizontal" : "vertical"} Violin brushes along its measurement axis, ${along}: use brush={{ axis: "${along}" }}.`); });
  // Axis titles: the category and measurement columns, not the density's columns.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, props.x), y: channelTitle(scope, props.y) }; });
  const hosted = $derived({ ...props, orientation: horizontal ? "horizontal" : "vertical" });
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

<TemplateHost {definition} parts={{ Density, Area, Anchor }} props={hosted} bind:this={host} />
