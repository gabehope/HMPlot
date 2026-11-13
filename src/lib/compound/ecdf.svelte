<script lang="ts">
  import { Transform, Line } from "../plot/composition.js";
  import type { EcdfProps } from "../plot/publicTypes.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./ecdf.js";
  // A template (./ecdf.js): the host expands it; this wrapper gives it its parts and handle.
  let props: EcdfProps = $props();
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

<TemplateHost {definition} parts={{ Transform, Line }} {props} bind:this={host} />
