<script lang="ts">
  // A copy of the hand-written Crosshair before it became a template (TODO 130.3), for parity.
  // A crosshair (TODO 45): a rule at @pointer_x and one at @pointer_y in the frame it is placed in,
  // and a readout of each value, finer than the ticks. In a Cartesian frame the readouts sit just
  // inside the frame's bottom (x) and left (y) edges; in a polar frame or on a map, whose rules
  // have no edge to pin to, one label beside the pointer holds both. Nothing draws where the
  // pointer is missing: off the frame, and in exports.
  import { Text, DataBoundary, framePointer } from "$lib/plot/composition.js";
  import Rule from "./Rule.svelte";
  import type { CrosshairProps } from "$lib/plot/publicTypes.js";
  let { axes = "xy", readout = true, color = undefined, width = undefined, dash = undefined, textColor = "#40505d",
    name = undefined }: CrosshairProps = $props();
  const pointer = framePointer({ enabled: () => readout });
  const READOUT = { readout: [0] };
  const present = (value) => typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);
  // A category is a one-row column (the readout's table has one row).
  const position = (value) => (typeof value === "string" || typeof value === "boolean" ? [value] : value);
  const rule = $derived({ kind: "Crosshair", defaults: { color: "#40505d" }, color, width, dash });
  const shown = $derived(readout && present(pointer.x) && present(pointer.y) && pointer.visible);
  const label = $derived({ color: textColor, align: "left" as const, legend: false, domains: false });
  // The Cartesian readouts write the pointer as their axes' readouts do (Text format="axis");
  // getReadout() reads what they drew, so it lags a move until the view settles.
  let xLabel = $state(), yLabel = $state();
  const drawn = (label) => label?.getLegendSource?.()?.guideMark?.()?.exportLabels?.[0] ?? "";
  /** The readouts as shown ("" where the pointer is missing, or with readout={false}). */
  export const getReadout = () => pointer.curved ? { x: pointer.readout("x"), y: pointer.readout("y") }
    : { x: shown ? drawn(xLabel) : "", y: shown ? drawn(yLabel) : "" };
</script>

{#if axes.includes("x")}<Rule name={name ? `${name} x` : undefined} dimension="x" value="@pointer_x" {...rule} />{/if}
{#if axes.includes("y")}<Rule name={name ? `${name} y` : undefined} dimension="y" value="@pointer_y" {...rule} />{/if}
{#if shown}
  <DataBoundary data={READOUT}>
    {#if pointer.curved}
      <Text x={position(pointer.x)} y={position(pointer.y)} dx={8} dy={8} {...label}
        text={[axes.includes("x") ? pointer.readout("x") : "", axes.includes("y") ? pointer.readout("y") : ""].filter(Boolean).join(", ")} />
    {:else}
      {#if axes.includes("x")}
        <Text bind:this={xLabel} x={position(pointer.x)} y="@view_y_min" text="@pointer_x" format="axis" dx={4} dy={-9} {...label} />
      {/if}
      {#if axes.includes("y")}
        <Text bind:this={yLabel} x="@view_x_min" y={position(pointer.y)} text="@pointer_y" format="axis" dx={6} dy={7} {...label} />
      {/if}
    {/if}
  </DataBoundary>
{/if}
