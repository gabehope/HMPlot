<script lang="ts">
  // Panels (TODO 136.16 slice 3): its Plots stacked over one shared x (utils/panels.svelte.js),
  // their plot areas lined up (an alignment group, as a template's ViewGrid is).
  import { setContext } from "svelte";
  import { ALIGN_GROUP, ALIGN_MEMBER, createAlignGroup } from "./utils/alignGroup.svelte.js";
  import { PANELS_CONTEXT, createPanels } from "./utils/panels.svelte.js";
  import type { PanelsProps } from "./publicTypes.js";
  let { x = undefined, gap = 6, children }: PanelsProps = $props();
  let element = $state<HTMLElement>();
  const align = createAlignGroup(() => element);
  setContext(ALIGN_GROUP, align);
  setContext(ALIGN_MEMBER, align);
  $effect(() => {
    if (element) return align.watch(element);
  });
  setContext(PANELS_CONTEXT, createPanels(() => x as Record<string, unknown> | undefined));
</script>

<div bind:this={element} class="hm-panels" style:gap={`${gap}px`}>{@render children?.()}</div>

<style>
  .hm-panels {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }
</style>
