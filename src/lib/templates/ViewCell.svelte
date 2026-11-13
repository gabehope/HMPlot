<script>
  // One area of a ViewGrid (TODO 136.16), holding a view.
  let { area, children } = $props();
</script>

<div class="hm-view-cell" style:grid-area={area} data-view-area={area}>{@render children?.()}</div>

<style>
  .hm-view-cell {
    min-width: 0;
  }
</style>
