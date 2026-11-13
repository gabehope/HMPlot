<script lang="ts">
  import Raw from "../marks/anchor.svelte";
  import Named from "./namedMark.svelte";
  import { endpointDescriptor } from "../utils/connections.js";
  import type { AnchorProps } from "../publicTypes.js";
  let props: AnchorProps = $props();
  let mark = $state<any>();
  // An Anchor has no legend entry; getMark() reaches its positions.
  export const getLegendSource = () => undefined;
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
  // One stable handle for endpoint selections, so re-renders select the same endpoint.
  const self = { getMark };
  /** This Anchor as a connection endpoint: `connect(a.endpoint(), b)`; `at` is "center". */
  export const endpoint = (config: Partial<{ at: string }> = {}) =>
    endpointDescriptor({ handle: self, at: config.at, kind: "Anchor" });
</script>

<Named bind:this={mark} component={Raw} kind="Anchor" values={props} />
