<script lang="ts">
  import { Segments, planeRule } from "../plot/composition.js";
  import type { RuleXProps } from "../plot/publicTypes.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./ruleX.js";
  // A template (./ruleX.js): the host expands it; this wrapper refuses it where x = c is a
  // plane (a 3D Cartesian view) and gives it its part and handle.
  let props: RuleXProps = $props();
  const guard = planeRule("RuleX", "x", () => props.x);
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

{#if guard.drawn}<TemplateHost {definition} parts={{ Segments }} {props} bind:this={host} />{/if}
