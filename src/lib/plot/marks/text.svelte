<script lang="ts">
  import LabelMark from "./label.svelte";
  import type { ComponentProps } from "svelte";
  type Props = ComponentProps<typeof LabelMark>;
  let props: Props = $props();
  let label=$state<any>();
  export const getLegendSource=()=>label?.getLegendSource();
  export const getMark=()=>label?.getMark();
</script>

<LabelMark bind:this={label} {...props} />
