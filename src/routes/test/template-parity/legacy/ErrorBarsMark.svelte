<script lang="ts">
  import type { ErrorBarsProps } from "$lib/plot/publicTypes.js";
  import Uncertainty from "$lib/plot/marks/uncertainty.svelte";
  let { position, lower, upper, ...others }: ErrorBarsProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
</script>

<Uncertainty
  bind:this={mark}
  kind="errors"
  {position}
  {lower}
  {upper}
  {...others}
/>
