<script lang="ts">
  import { Transform, Prism } from "../plot/composition.js";
  import type { BarProps } from "../plot/publicTypes.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./bar.js";
  // A template (./bar.js): the host expands it; this wrapper gives it its parts and handle.
  let props: BarProps = $props();
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
  /** This Bar as a connection endpoint: `at` is "center", an edge, "value" or "baseline". */
  export const endpoint = (config: Partial<{ at: string }> = {}) => host.endpointOf(config);
</script>

<TemplateHost {definition} parts={{ Transform, Prism }} {props} bind:this={host} />
