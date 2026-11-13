<script lang="ts">
  import { getContext, onDestroy } from "svelte";
  import { GUIDE_CONTEXT, resolveGuide, guideObject, definitionKey } from "./utils/guides.js";
  import GuideView from "./guides/guideView.svelte";
  import { exportStandaloneGuide } from "./utils/guideDocumentExport.js";
  import { useReporter } from "./utils/reporter.js";
  import type { LegendProps } from "./publicTypes.js";
  let props: LegendProps = $props();
  const registry: any = getContext(GUIDE_CONTEXT),
    id = {};
  const embedded = !!registry;
  const source = $derived("for" in props ? props.for : registry?.handle);
  const channel = $derived(props.channel),
    label = $derived(props.label);
  const placement = $derived(props.position ?? (channel ? "right" : "bottom"));
  let host = $state<HTMLDivElement>();
  // Its warnings and lints name this Legend's scene node, wherever its guide renders (TODO 136.13).
  const reporters = { warning: useReporter("Legend", { severity: "warning" }), lint: useReporter("Legend", { severity: "lint" }) };
  export function exportable() { return !embedded; }
  export const exportSVG = (options = {}) => exportStandaloneGuide(host, "svg", options);
  export const exportPDF = (options = {}) => exportStandaloneGuide(host, "pdf", options);
  $effect(() => {
    if (!registry) return;
    if (!["top", "bottom", "left", "right"].includes(placement))
      throw Error("Legend position must be top, bottom, left, or right.");
    // A Legend written inside a Facet cell mounts once per cell; the host shows one of them.
    const describe = (target) => {
      const resolved = resolveGuide(target);
      if (Array.isArray(resolved)) return resolved.map(describe).join("|");
      if (resolved?.kind === "plot") return "plot";
      const options = guideObject(resolved)?.options;
      return options ? definitionKey(options) : "none";
    };
    const key = JSON.stringify([placement, channel ?? null, label ?? null, describe(source)]);
    // channel and target: the Plot's automatic legend leaves this channel to it (TODO 134.9).
    return registry.addGuide(id, { snippet: content, position: placement, key, channel, target: () => source });
  });
</script>

{#snippet content()}<GuideView
    target={source}
    {channel}
    {label}
    position={placement}
    explain={channel === undefined}
    {reporters}
  />{/snippet}
{#if !embedded}<div class="heatmap-external-guide" bind:this={host}>
    {@render content()}
  </div>{/if}
