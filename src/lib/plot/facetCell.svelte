<script lang="ts">
  import { setContext, onMount, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import Frame from "./frame.svelte";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { FACET_CONTEXT, createFacetService } from "./utils/facetService.js";
  import { GUIDE_CONTEXT } from "./utils/guides.js";
  let {
    cell,
    controller,
    embedded = false,
    ownLegend = false,
    frameX = {}, frameY = {},
    children,
  }: { cell: any; controller: any; embedded?: boolean; ownLegend?: boolean; frameX?: any; frameY?: any; children?: Snippet } = $props();
  // Facet legend="cell": the cell's Plot keeps its own registry and legend strips.
  if (untrack(() => ownLegend)) setContext(GUIDE_CONTEXT, undefined);
  let visible = $state(false),
    element = $state<HTMLElement>(),
    content = $state<HTMLElement>(),
    height = $state(0);
  const active = $derived(embedded || visible || controller.forced(cell.key));
  const mounted = $derived(active || controller.warm(cell.key));
  setContext(DATA_CONTEXT, { read: () => cell.view });
  const service = createFacetService({
    cell: () => cell,
    controller: () => controller,
    active: () => active,
    embedded: () => embedded,
  });
  setContext(FACET_CONTEXT, service);
  $effect(() => {
    if (!mounted) service.resetSlots();
  });
  onMount(() => {
    if (embedded) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const next = entries[0].isIntersecting;
        // Do not warm cells that have never entered the viewport.
        if (next !== visible) controller.visibility(cell.key, next);
        visible = next;
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    const resize = new ResizeObserver(() => {
      if (mounted) {
        height = content.getBoundingClientRect().height;
        controller.height(height);
      }
    });
    resize.observe(content);
    return () => {
      controller.forget(cell.key);
      observer.disconnect();
      resize.disconnect();
    };
  });
</script>

{#if embedded}
  <Frame name={cell.label || "All observations"} x={frameX} y={frameY} {...({ _facetCell: true } as any)}>{@render children?.()}</Frame>
{:else}
<section
  bind:this={element}
  class="facet-cell"
  style:grid-row={cell.gridRow}
  style:grid-column={cell.gridColumn}
  aria-label={cell.label}
  style:min-height={`${height || controller.estimatedHeight}px`}
>
  <div bind:this={content}>
    <div class="facet-label">{cell.label || "All observations"}</div>
    {#if mounted}{@render children?.()}{/if}
  </div>
</section>
{/if}

<style>
  .facet-cell {
    min-width: 0;
    overflow: hidden;
  }
  .facet-label {
    font: 500 12px/1.4 "Source Sans 3", system-ui, sans-serif;
    color: #586272;
    padding: 8px 4px;
  }
</style>
