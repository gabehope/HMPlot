<script lang="ts">
  import Prism from "./prism.svelte";
  let props: any = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
</script>

<Prism bind:this={mark} kind="rect" {...props} />
