<script lang="ts">
  import type { AreaProps } from "../publicTypes.js";
  import Uncertainty from "./uncertainty.svelte";
  let { x, lower = 0, upper, ...others }: AreaProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
</script>

<Uncertainty
  bind:this={mark}
  kind="area"
  {x}
  {lower}
  {upper}
  {...others}
/>
