<script lang="ts">
  import { Segments, planeRule } from "../plot/composition.js";
  import type { RuleYProps } from "../plot/publicTypes.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./ruleY.js";
  // A template (./ruleY.js): the host expands it; this wrapper refuses it where y = c is a
  // plane (a 3D Cartesian view) and gives it its part and handle.
  let props: RuleYProps = $props();
  const guard = planeRule("RuleY", "y", () => props.y);
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

{#if guard.drawn}<TemplateHost {definition} parts={{ Segments }} {props} bind:this={host} />{/if}
