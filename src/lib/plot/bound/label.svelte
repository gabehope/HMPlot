<script lang="ts">
  import Raw from "../marks/labels.svelte";
  import Named from "./namedMark.svelte";
  import { endpointDescriptor } from "../utils/connections.js";
  import type { TextProps } from "../publicTypes.js";
  let props: TextProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
  // One stable handle for endpoint selections, so re-renders select the same endpoint.
  const self = { getMark };
  /** This Text as a connection endpoint: `connect(a.endpoint({at}), b)`. */
  export const endpoint = (config: Partial<{ at: string }> = {}) =>
    endpointDescriptor({ handle: self, at: config.at, kind: "Text" });
</script>

<Named bind:this={mark} component={Raw} kind="Text" values={props} />
