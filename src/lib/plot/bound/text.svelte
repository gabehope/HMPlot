<script lang="ts">
  import Raw from "../marks/text.svelte";
  import Named from "./namedMark.svelte";
  import type { Text3DProps } from "../publicTypes.js";
  let props: Text3DProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
</script>

<Named bind:this={mark} component={Raw} kind="Text3D" values={props} />
