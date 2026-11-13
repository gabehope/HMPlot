<script lang="ts">
  import Raw from "../marks/area.svelte";
  import Named from "./namedMark.svelte";
  import { bandMarkValues } from "../utils/uncertainty.js";
  import type { AreaProps } from "../publicTypes.js";
  let props: AreaProps = $props();
  // Orientation selects the value axis; lower/upper define both edges.
  const values = $derived(bandMarkValues("Area", props));
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
</script>

<Named bind:this={mark} component={Raw} kind="Area" {values} />
