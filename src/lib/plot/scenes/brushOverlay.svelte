<script lang="ts">
  import type { createBrushController } from "../utils/brushController.svelte.js";
  let {
    brush,
    hovered,
  }: { brush: ReturnType<typeof createBrushController>; hovered: boolean } =
    $props();
</script>

{#if brush.brushRect && (brush.brushActive || brush.brushGesture || brush.pendingBrush)}<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
  <div
    class="brush-region"
    role="group"
    aria-label="Brush constraints"
    tabindex="0"
    data-active={brush.bandActive(
      brush.rootBinding?.owner,
      brush.rootIdentities,
    ) || undefined}
    onfocus={() => brush.focusBand("root")}
    onblur={(event) => brush.blurBand(event, "root")}
    onkeydown={(event) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        brush.removeDisplayedBrush();
      } else
        brush.nudgeBand(event, {
          rect: brush.brushRect!,
          axis: brush.brushRect!.axis,
          rootAxis: brush.brushRect!.rootAxis,
        });
    }}
    style:cursor={brush.brushCursorState || undefined}
    style:left={`${brush.brushRect.left}px`}
    style:top={`${brush.brushRect.top}px`}
    style:width={`${Math.max(1, brush.brushRect.right - brush.brushRect.left)}px`}
    style:height={`${Math.max(1, brush.brushRect.bottom - brush.brushRect.top)}px`}
  ></div>{/if}
{#each brush.stripBands as band (band.key)}
  {#if brush.stripDrag?.key !== band.key}<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
    <div
      class="brush-region strip"
      role="group"
      aria-label={`Brush on ${band.name}`}
      tabindex="0"
      data-frame={band.frameKey}
      data-axis={band.axis}
      data-column={band.name}
      data-active={brush.bandActive(band.binding.owner, [band.identity]) ||
        undefined}
      onfocus={() => brush.focusBand(band)}
      onblur={(event) => brush.blurBand(event, band)}
      onkeydown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          brush.clearBand(band);
        } else brush.nudgeBand(event, { ...band, strip: brush.stripOf(band) });
      }}
      style:cursor={brush.brushCursorState || undefined}
      style:left={`${band.rect.left}px`}
      style:top={`${band.rect.top}px`}
      style:width={`${Math.max(1, band.rect.right - band.rect.left)}px`}
      style:height={`${Math.max(1, band.rect.bottom - band.rect.top)}px`}
    ></div>{/if}
{/each}
{#if brush.stripDrag}<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
  <div
    class="brush-region strip"
    data-dragging
    role="presentation"
    style:left={`${brush.stripDrag.left}px`}
    style:top={`${brush.stripDrag.top}px`}
    style:width={`${Math.max(1, brush.stripDrag.right - brush.stripDrag.left)}px`}
    style:height={`${Math.max(1, brush.stripDrag.bottom - brush.stripDrag.top)}px`}
  ></div>{/if}
{#if brush.activeBand && brush.activeBand.key !== "root" && !brush.brushGesture && !brush.pendingBrush && !brush.stripDrag}
  {@const band = brush.stripBands.find(
    (item) => item.key === brush.activeBand!.key,
  )}
  {#if band}
    {@const place = brush.bandControlPlace(band)}
    <div
      class="brush-other band-controls"
      data-brush-controls
      data-band={band.key}
      style:left={`${place.left}px`}
      style:top={`${place.top}px`}
      style:transform={place.transform}
    >
      <button
        onpointerdown={(event) => event.stopPropagation()}
        onclick={() => brush.clearBand(band)}>Clear {band.name}</button
      >
    </div>
  {/if}
{/if}
{#if brush.brushActive && !brush.brushControlsDismissed && (hovered || brush.brushControlsFocused)}
  <div
    class="brush-other"
    data-brush-controls
    title={brush.brushOtherNames || "Brush constraints"}
  >
    {#if brush.brushOtherCount}+{brush.brushOtherCount} other constraint{brush.brushOtherCount ===
      1
        ? ""
        : "s"}{/if}
    {#if brush.brushRect || brush.stripBands.length}<button
        onpointerdown={(event) => event.stopPropagation()}
        onclick={brush.clearCurrent}>Clear current</button
      >{/if}
    <button
      onpointerdown={(event) => event.stopPropagation()}
      onclick={brush.clearBrush}>Clear all</button
    >
  </div>
{/if}

<style>
  .brush-region {
    position: absolute;
    z-index: 7;
    box-sizing: border-box;
    cursor: move;
    touch-action: none;
    border: 1px solid #4779b8;
    background: #4779b826;
  }
  .brush-region.strip {
    background: #4779b866;
  }
  .brush-region[data-active] {
    border-color: #315f98;
    box-shadow: 0 0 0 1px #315f98;
  }
  .brush-other {
    position: absolute;
    z-index: 8;
    left: 10px;
    top: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 7px;
    border: 1px solid #b7c7db;
    background: #fffffff0;
    color: #40556f;
    font: 11px system-ui;
  }
  .brush-other button {
    border: 0;
    background: none;
    color: #315f98;
    font: inherit;
    cursor: pointer;
    padding: 0;
  }
</style>
