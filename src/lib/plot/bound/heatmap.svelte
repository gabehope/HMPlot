<script lang="ts">
  import Raw from "../marks/heatmap.svelte";
  import Named from "./namedMark.svelte";
  import type { HeatmapProps } from "../publicTypes.js";
  let props: HeatmapProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
</script>

<Named bind:this={mark} component={Raw} kind="Heatmap" values={props} />
