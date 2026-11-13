<script>
  // A template's views in a CSS grid (TODO 136.16): an alignment group (TODO 136.10 slice 5),
  // so its Plots line up their plot areas where their figures share an edge, as a Row's,
  // Column's or Grid's do in a scene. `columns` and `rows` are grid tracks, `areas` the grid's
  // named areas, which its ViewCells take.
  import { setContext } from "svelte";
  import { ALIGN_GROUP, ALIGN_MEMBER, createAlignGroup } from "../plot/utils/alignGroup.svelte.js";

  let { columns = "minmax(0, 1fr)", rows = "auto", areas = undefined, gap = 8, children } = $props();
  let element = $state();
  const group = createAlignGroup(() => element);
  setContext(ALIGN_GROUP, group);
  setContext(ALIGN_MEMBER, group);
  $effect(() => {
    if (element) return group.watch(element);
  });
</script>

<div bind:this={element} class="hm-view-grid" style:grid-template-columns={columns} style:grid-template-rows={rows}
  style:grid-template-areas={areas} style:gap={`${gap}px`}>
  {@render children?.()}
</div>

<style>
  .hm-view-grid {
    display: grid;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
</style>
