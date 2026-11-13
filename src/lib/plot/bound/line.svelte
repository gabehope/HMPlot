<script lang="ts">
  import Raw from "../marks/line.svelte";
  import Named from "./namedMark.svelte";
  import type { LineProps } from "../publicTypes.js";
  let props: LineProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
</script>

<Named bind:this={mark} component={Raw} kind="Line" values={props} />
