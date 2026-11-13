<script lang="ts">
  import Raw from "../marks/scatter3d.svelte";
  import Named from "./namedMark.svelte";
  import { endpointDescriptor } from "../utils/connections.js";
  import type { Points3DProps } from "../publicTypes.js";
  let props: Points3DProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
  // One stable handle for endpoint selections, so re-renders select the same endpoint.
  const self = { getMark };
  /** This Points3D as a connection endpoint: `connect(a.endpoint({at}), b)`. */
  export const endpoint = (config: Partial<{ at: string }> = {}) =>
    endpointDescriptor({ handle: self, at: config.at, kind: "Points3D" });
</script>

<Named bind:this={mark} component={Raw} kind="Points3D" values={props} />
