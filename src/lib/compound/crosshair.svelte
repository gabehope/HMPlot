<script lang="ts">
  import { Segments, Text, Undescribed, DataBoundary, ThemeDefaults, framePointer, planeRule } from "../plot/composition.js";
  import type { CrosshairProps } from "../plot/publicTypes.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./crosshair.js";
  // A template (./crosshair.js): the host expands it; this wrapper leaves it out where its rules
  // are planes (a 3D Cartesian view, quietly: they are at the pointer), and reads its readouts.
  let props: CrosshairProps = $props();
  $effect.pre(() => {
    if (![undefined, "edges", "pointer"].includes(props.readoutPosition as any))
      throw Error(`Crosshair.readoutPosition is "edges" or "pointer"; received ${JSON.stringify(props.readoutPosition)}.`);
    if (![undefined, "x", "y", "xy"].includes(props.axes as any))
      throw Error(`Crosshair.axes is "x", "y" or "xy"; received ${JSON.stringify(props.axes)}.`);
  });
  const guard = planeRule("Crosshair", "x", () => "@pointer_x");
  const pointer = framePointer({ enabled: () => props.readout !== false });
  const present = (value: unknown) => typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);
  const shown = $derived(props.readout !== false && present(pointer.x) && present(pointer.y) && pointer.visible);
  let host = $state<any>();
  // The readouts write the pointer as their axes' readouts do (Text format="axis"); getReadout()
  // reads what they drew, so it lags a move until the view settles.
  const drawn = (id: string) => host?.part(id)?.getLegendSource?.()?.guideMark?.()?.exportLabels?.[0] ?? "";
  /** The readouts as shown ("" where the pointer is missing, or with readout={false}). */
  export const getReadout = () => props.readoutPosition === "pointer" ? { x: pointer.readout("x"), y: pointer.readout("y") }
    : { x: shown ? drawn("xReadout") : "", y: shown ? drawn("yReadout") : "" };
  export const whenSettled = () => host?.whenSettled();
</script>

{#if guard.drawn}<TemplateHost {definition} parts={{ DataBoundary, ThemeDefaults, Segments, Undescribed, Text }} {props} bind:this={host} />{/if}
