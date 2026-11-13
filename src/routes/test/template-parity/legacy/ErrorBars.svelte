<script lang="ts">
  import Raw from "./ErrorBarsMark.svelte";
  import Named from "$lib/plot/bound/namedMark.svelte";
  import { bandMarkValues } from "$lib/plot/utils/uncertainty.js";
  import type { ErrorBarsProps } from "$lib/plot/publicTypes.js";
  let props: ErrorBarsProps = $props();
  // orientation, as on Bar, BoxPlot and Violin (R2.0): "vertical" bars run along y (the default),
  // "horizontal" ones along x. The mark itself keeps its axis, which is not a prop (TODO 64).
  const values = $derived(bandMarkValues("ErrorBars", props));
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
</script>

<Named bind:this={mark} component={Raw} kind="ErrorBars" {values} />
