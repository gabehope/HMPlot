<script lang="ts">
  import { Segments } from "../plot/composition.js";
  import type { ArrowsProps } from "../plot/publicTypes.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./arrows.js";
  let props: ArrowsProps = $props();
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
  export const endpoint = (config: Partial<{ at: string }> = {}) => host.endpointOf(config);
</script>

<TemplateHost {definition} parts={{ Segments }} {props} bind:this={host} />
