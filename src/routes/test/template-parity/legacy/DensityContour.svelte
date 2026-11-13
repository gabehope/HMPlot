<script lang="ts">
  import { Density, Contour, Filter, Segments, Polygon, ThemeDefaults, DATA_CONTEXT, AXIS_NAMES_CONTEXT, channelTitle, greater,
    INPUT_CONTEXT, InputPending, resolveInput } from "$lib/plot/composition.js";
  import type { DensityContourProps } from "$lib/plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  // A copy of the hand-written DensityContour before it became a template (TODO 130.3), for parity.
  // Contours of a 2-D density (TODO 47.5), as d3's contourDensity: Density, Contour, then
  // Segments for lines or Polygon for filled bands, colored by level.
  let { x, y, weight = undefined, bandwidth = "auto", resolution = 128, bounds = undefined, thresholds = 10, mode = "lines",
    color = undefined, fill = undefined, width = undefined, opacity = undefined, outlineColor = undefined, outlineWidth = undefined, outlineOpacity = undefined,
    name, ...props }: DensityContourProps = $props();
  const data: any = getContext(DATA_CONTEXT), inputs: any = getContext(INPUT_CONTEXT);
  // The mode picks the parts, so an input read in it resolves here (the last value while it waits).
  let lastMode = "lines";
  const drawn = $derived.by(() => {
    try { return (lastMode = resolveInput(mode, inputs, "DensityContour.mode") ?? "lines"); }
    catch (error) { if (error instanceof InputPending) return lastMode; throw error; }
  });
  // Axis titles: the columns the density is of.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, x), y: channelTitle(scope, y) }; });
  let transform = $state<any>(), mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
  export const whenSettled = () => transform?.whenSettled();
</script>

<!-- The theme's DensityContour entry: color, width and opacity style the lines; fill, opacity and
  the outline the bands. -->
<Density bind:this={transform} {x} {y} {weight} {bandwidth} {resolution} {bounds}>
  <Contour field="density" {thresholds} mode={drawn}>
    {#if drawn === "bands"}
      <!-- The first band starts at or below the least density: the whole grid, so it is left out. -->
      <Filter where={greater("band", 0)}>
        <ThemeDefaults kind="DensityContour" defaults={{ fill: "lower" }} values={{ fill, opacity, outlineColor, outlineWidth, outlineOpacity }}
          only={["fill", "opacity", "outlineColor", "outlineWidth", "outlineOpacity"]}>
          <Polygon bind:this={mark} fill={fill ?? "lower"} {...props} />
        </ThemeDefaults>
      </Filter>
    {:else}
      <ThemeDefaults kind="DensityContour" defaults={{ color: "level", width: 1 }} values={{ color, width, opacity }} only={["color", "width", "opacity"]}>
        <Segments bind:this={mark} start="start" end="end" {...props} />
      </ThemeDefaults>
    {/if}
  </Contour>
</Density>
