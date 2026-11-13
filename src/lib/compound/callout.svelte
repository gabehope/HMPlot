<script lang="ts">
  import { Text } from "../plot/composition.js";
  import type { CalloutProps } from "../plot/publicTypes.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./callout.js";
  // A template (./callout.js): the host expands it; this wrapper gives it its part and handle.
  let props: CalloutProps = $props();
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

<TemplateHost {definition} parts={{ Text }} {props} bind:this={host} />
