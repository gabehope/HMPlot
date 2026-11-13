<script lang="ts">
  import { Density, Contour, Filter, Polygon, DATA_CONTEXT, AXIS_NAMES_CONTEXT, channelTitle } from "../plot/composition.js";
  import type { DensityBandsProps } from "../plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./densityBands.js";
  // A template (./densityBands.js): the host expands it; this wrapper titles the axes and gives
  // it its parts and handle.
  let props: DensityBandsProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  // Axis titles: the columns the density is of.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, props.x), y: channelTitle(scope, props.y) }; });
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

<TemplateHost {definition} parts={{ Density, Contour, Filter, Polygon }} {props} bind:this={host} />
