<script lang="ts">
  import Raw from "../marks/surface.svelte";
  import Named from "./namedMark.svelte";
  import type { SurfaceProps } from "../publicTypes.js";
  let props: SurfaceProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();
</script>

<Named bind:this={mark} component={Raw} kind="Surface" values={props} />
