<script lang="ts">
  import { Transform, Line, ThemeDefaults, DATA_CONTEXT, AXIS_NAMES_CONTEXT, channelTitle } from "$lib/plot/composition.js";
  import type { EcdfProps } from "$lib/plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  // The empirical distribution of a column as steps (TODO 47.3): the internal ECDF transform
  // (no longer public: TODO 137.3), then a Line with
  // curve="step-after", one per group of `by`, colored by it.
  let { x, by = undefined, complementary = false, normalize = "fraction", color = undefined, name, ...props }: EcdfProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, x), y: complementary ? "1 − ECDF" : "ECDF" }; });
  let transform = $state<any>(), line = $state<any>();
  export const getLegendSource = () => line?.getLegendSource();
  export const getMark = () => line?.getMark();
  export const whenSettled = () => transform?.whenSettled();
</script>

<ThemeDefaults kind="Ecdf" defaults={{ width: 2 }} values={{ color }}>
  <Transform bind:this={transform} kind="ECDF" {x} {by} {complementary} {normalize}>
    <Line bind:this={line} {x} y="ecdf" curve="step-after" {...(by === undefined ? {} : { series: by, color: color ?? by })} {...props} />
  </Transform>
</ThemeDefaults>
