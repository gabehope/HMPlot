<script lang="ts">
  import type { createTooltipController } from "../utils/tooltipController.svelte.js";
  let {
    tooltips,
    canvasHost,
  }: {
    tooltips: ReturnType<typeof createTooltipController>;
    canvasHost: HTMLDivElement | undefined;
  } = $props();
</script>

{#if tooltips.entry && tooltips.place}
  {#each tooltips.entry.markers ?? [] as marker, index (index)}
    <div
      class="plot-tooltip-marker"
      style:left={`${canvasHost!.offsetLeft + marker.at[0]}px`}
      style:top={`${canvasHost!.offsetTop + marker.at[1]}px`}
      style:background={marker.color}
    ></div>
  {/each}
  <div
    class="plot-tooltip"
    role="tooltip"
    bind:offsetWidth={tooltips.width}
    bind:offsetHeight={tooltips.height}
    style:left={`${tooltips.place.left}px`}
    style:top={`${tooltips.place.top}px`}
  >
    {#if tooltips.entry.content}{@render tooltips.entry.content(
        tooltips.entry.context,
      )}
    {:else}
      {#if tooltips.entry.title}<div class="plot-tooltip-title">
          {#if tooltips.entry.swatch}<span
              class="plot-tooltip-swatch"
              style:background={tooltips.entry.swatch}
            ></span>{/if}{tooltips.entry.title}
        </div>{/if}
      <table>
        <tbody>
          {#each tooltips.entry.lines as line, index (index)}<tr
              ><th scope="row"
                >{#if line.swatch}<span
                    class="plot-tooltip-swatch"
                    style:background={line.swatch}
                  ></span>{/if}{line.label}</th
              ><td>{line.text}</td></tr
            >{/each}
        </tbody>
      </table>
    {/if}
  </div>
{/if}

<style>
  .plot-tooltip {
    position: absolute;
    z-index: 20;
    pointer-events: none;
    /* Its own width wherever it is: shrink-to-fit near the plot's edge made the width depend on
       the side placement chose, and the side on the width, a loop at frame rate (TODO 135.11). */
    width: max-content;
    /* Never wider than the plot it is in (a narrow facet cell): its text wraps instead. */
    max-width: min(320px, 100%);
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid #d3d9e1;
    border-radius: 4px;
    background: #fffffff5;
    box-shadow: 0 2px 6px #1d27331f;
    color: #26313d;
    font:
      12px/1.35 system-ui,
      sans-serif;
  }
  .plot-tooltip-title {
    font-weight: 600;
    margin-bottom: 3px;
  }
  .plot-tooltip-swatch {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 5px;
    border-radius: 2px;
    vertical-align: -1px;
  }
  .plot-tooltip-marker {
    position: absolute;
    z-index: 19;
    pointer-events: none;
    width: 7px;
    height: 7px;
    margin: -5px 0 0 -5px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: #26313d;
    box-shadow: 0 0 0 1px #26313d55;
  }
  .plot-tooltip table {
    border-collapse: collapse;
  }
  .plot-tooltip th {
    padding: 0 10px 0 0;
    font-weight: 400;
    color: #5b6470;
    text-align: left;
    white-space: nowrap;
  }
  .plot-tooltip td {
    padding: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
