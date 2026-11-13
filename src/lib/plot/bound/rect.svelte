<script lang="ts">
  import { coordinateViewStore } from "../utils/viewContext.js";
  import Raw from "../marks/rect.svelte";
  import PolarRaw from "../marks/polarRect.svelte";
  import Named from "./namedMark.svelte";
  import { endpointDescriptor } from "../utils/connections.js";
  import { getOptionsContext } from "../utils/context.js";
  import type { RectProps } from "../publicTypes.js";
  let props: RectProps = $props();
  let mark = $state<any>();
  const options = getOptionsContext(), coordinates = options.store("coordinates"), projection = options.store("projection"), mode = coordinateViewStore(options);
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
  // One stable handle for endpoint selections, so re-renders select the same endpoint.
  const self = { getMark };
  /** This Rect as a connection endpoint: `connect(a.endpoint({at}), b)`. */
  export const endpoint = (config: Partial<{ at: string }> = {}) =>
    endpointDescriptor({ handle: self, at: config.at, kind: "Rect" });
</script>

<!-- A polar Rect is an annular sector; in a spherical frame a Rect is a lon/lat patch. -->
{#if $mode === "2d" && $coordinates === "polar"}
  <Named bind:this={mark} component={PolarRaw} kind="Rect" values={props} />
{:else}
  <Named bind:this={mark} component={Raw} kind="Rect" values={props} />
{/if}
