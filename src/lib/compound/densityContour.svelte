<script lang="ts">
  import { Density, Contour, Segments, DATA_CONTEXT, AXIS_NAMES_CONTEXT, channelTitle, INPUT_CONTEXT, InputPending, resolveInput } from "../plot/composition.js";
  import type { DensityContourProps } from "../plot/publicTypes.js";
  import { getContext, setContext, untrack } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import DensityBands from "./densityBands.svelte";
  import definition from "./densityContour.js";
  // A template (./densityContour.js): the host expands it; this wrapper titles the axes, gives it
  // its parts and handle, and draws a DensityBands for the deprecated mode="bands".
  let { mode = undefined, ...props }: DensityContourProps = $props();
  const data: any = getContext(DATA_CONTEXT), inputs: any = getContext(INPUT_CONTEXT);
  // The mode picks the mark, so an input read in it resolves here (the last value while it waits).
  let lastMode = "lines";
  const drawn = $derived.by(() => {
    try { return (lastMode = resolveInput(mode, inputs, "DensityContour.mode") ?? "lines"); }
    catch (error) { if (error instanceof InputPending) return lastMode; throw error; }
  });
  // Any mode is told, a value or an input: the keyword goes (TODO 130.3). Once per page.
  $effect(() => {
    if (mode !== undefined && !warned) {
      warned = true;
      console.warn("DensityContour.mode is deprecated and will be removed: DensityContour draws lines; use DensityBands for filled bands (its theme entry is DensityBands).");
    }
  });
  // The lines' props, which DensityBands does not take, are left out of the bands. Another mode
  // than "lines" or "bands" reaches Contour, whose error names the two.
  const bandProps = $derived.by(() => { const { color, width, colorScale, widthScale, size, sizeScale, position, z, interpolation, maxInstances, ...rest } = props; return rest; });
  const lineProps = $derived(drawn === "lines" ? props : { ...props, mode: drawn });
  // Axis titles: the columns the density is of.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, props.x), y: channelTitle(scope, props.y) }; });
  let host = $state<any>();
  // Settings listeners follow the lines' host across a mode switch. The deprecated bands send
  // none: their edits are a Polygon's, which DensityContour's props would misname.
  const listeners = new Map<(values: Record<string, unknown>) => void, () => void>();
  const attach = (listener: (values: Record<string, unknown>) => void) => (drawn !== "bands" && host?.subscribeSettings(listener)) || (() => {});
  $effect(() => {
    void host, drawn;
    untrack(() => { for (const listener of listeners.keys()) listeners.set(listener, attach(listener)); });
    return () => { for (const off of listeners.values()) off(); };
  });
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => {
    listeners.set(listener, attach(listener));
    return () => { listeners.get(listener)?.(); listeners.delete(listener); };
  };
</script>

<script module lang="ts">
  let warned = false;
</script>

{#if drawn === "bands"}
  <DensityBands {...bandProps} bind:this={host} />
{:else}
  <TemplateHost {definition} parts={{ Density, Contour, Segments }} props={lineProps} bind:this={host} />
{/if}
