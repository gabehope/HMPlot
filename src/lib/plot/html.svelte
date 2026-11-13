<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { AXIS_CONTEXT } from "./utils/axisFrame.js";
  import { HTML_CONTEXT } from "./utils/screenMapping.js";
  import { attachHtml } from "./utils/htmlPortal.js";
  import type {
    HtmlProps,
    ScreenMapping,
    ScreenMappingHandle,
  } from "./publicTypes.js";

  let { x, y, dx = 0, dy = 0, children }: HtmlProps = $props();
  const frame = getContext<{ screenMapping: ScreenMappingHandle } | undefined>(
    AXIS_CONTEXT,
  );
  const overlay = getContext<
    { host(): HTMLElement | undefined; focus(): void } | undefined
  >(HTML_CONTEXT);
  if (!frame || !overlay)
    throw Error(
      "Html must be inside a Plot or Frame; pass scalar numeric x and y coordinates.",
    );
  let wrapper: HTMLDivElement;
  let source: HTMLDivElement;
  let mapping = $state.raw<ScreenMapping | null>(null);
  const point = $derived(mapping?.project({ x, y }));
  const visible = $derived(
    !!point?.inside && Number.isFinite(dx) && Number.isFinite(dy),
  );
  const restoreFocus = () => {
    if (wrapper?.contains(document.activeElement)) overlay.focus();
  };
  $effect(() => {
    if (!visible) restoreFocus();
  });
  onMount(() => {
    const host = overlay.host();
    if (!host)
      throw Error("Html: wait for a mounted Plot before attaching content.");
    const detach = attachHtml(host, source, wrapper);
    const stop = frame.screenMapping.subscribeScreenMapping((value) => {
      mapping = value;
    });
    return () => {
      restoreFocus();
      stop();
      detach();
    };
  });
</script>

<div hidden bind:this={source}>
  <div
    bind:this={wrapper}
    data-hmplot-html
    inert={!visible}
    hidden={!visible}
    style:transform={`translate(${(point?.x ?? 0) + dx}px, ${(point?.y ?? 0) + dy}px)`}
  >
    {@render children?.()}
  </div>
</div>

<style>
  [data-hmplot-html] {
    position: absolute;
    top: 0;
    left: 0;
    width: max-content;
    pointer-events: auto;
  }
</style>
