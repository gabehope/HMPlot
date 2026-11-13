<script lang="ts">
  import { categoryField, Dodge, Points, DODGE_AXIS_CONTEXT } from "../plot/composition.js";
  import { setContext } from "svelte";
  import type { SwarmProps } from "../plot/publicTypes.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./swarm.js";
  // A template (./swarm.js): the host expands it; this wrapper gives its Dodge the axis the points
  // spread along, from the orientation or the one categorical position, and gives it its parts
  // and handle.
  let { orientation = undefined, ...props }: SwarmProps = $props();
  // Read by the Dodge as it prepares its layout, so a wrong pair of columns is the mark's error.
  setContext(DODGE_AXIS_CONTEXT, (scope: any) => {
    if (orientation) return orientation === "horizontal" ? "y" : "x";
    const cx = categoryField(scope, props.x), cy = categoryField(scope, props.y);
    if (cx === cy) throw Error("Swarm needs exactly one categorical position axis or an explicit orientation.");
    return cx ? "x" : "y";
  });
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

<TemplateHost {definition} parts={{ Dodge, Points }} {props} bind:this={host} />
