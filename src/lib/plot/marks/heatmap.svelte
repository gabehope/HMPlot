<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import SurfaceChildren from "../scenes/surfaceChildren.svelte";
  import { T, useThrelte, useTask } from "@threlte/core";
  import { untrack } from "svelte";
  import { warpDetail } from "../utils/surfaceGeometry.js";
  import { resolveCoordinateOperations } from "../utils/coordinateOperations.js";
  const { renderer, invalidate, camera } = useThrelte();
  const viewServices = useViewServices();
  import { Heatmap as HeatmapObject } from "../objects/heatmap.js";
  import {
    configureMarkOptions,
    ensureHeatmapOptions,
  } from "../objects/defaultOptions.js";

  import type { MarkProps } from "../publicTypes.js";
  let {
    children = undefined,
    textureResolution = undefined,
    surfaceHeight = undefined,
    fill = "#00ff00",
    image = false,
    // An Image's nearest sampling; a Heatmap's sharp cells, automatic when unset (TODO 134.15).
    pixelated = undefined,
    // A grid table's placement (TODO 51; utils/gridMarks.js): remap tables for uneven axes, or a
    // curvilinear grid's cell corners.
    _gridRemap = null,
    _gridMesh = null,
    // A grid table's field (TODO 51) blends unless pixelated is set (Heatmap.cellMode); a plain
    // grid's cell bounds are the publisher's (TODO 134.15), not an option.
    _gridTable = false,
    _cellBounds = undefined,
    name = undefined,
    options = undefined,
    ...others
  }: MarkProps & Record<string, any> = $props();

  const component = markComponent("Heatmap", {
    name: () => name,
    setup: (parent) => ensureHeatmapOptions(parent),
    create: (local) => {
      configureMarkOptions(local, "heatmap");
      const object = new HeatmapObject(local, viewServices, invalidate, undefined, untrack(() => image), untrack(() => pixelated));
      // Named in messages and export reports by its component (TODO 67.6).
      if (untrack(() => image)) object.componentName = "Image";
      return object;
    },
    display: (defaults) => (options === undefined ? defaults : options),
    populate: () => ({
      ...others,
      ...(others.zScale === undefined && surfaceHeight !== undefined ? { zScale: surfaceHeight } : {}),
    }),
    handlers: () => others,
  });
  const { mark, local: heatmapOptions } = component;

  $effect(() => {
    mark.setPixelated(pixelated, _gridTable);
  });

  $effect(() => {
    others.normalization;
    mark.surfaceVersion = (mark.surfaceVersion ?? 0) + 1;
    mark.setGridRemap(_gridRemap);
    mark.setGridMesh(_gridMesh);
    mark.fields.get("fill").update(fill);
  });

  // A warped grid (a polar, nested nonlinear or placed chain) resolves its
  // cells from the screen curvature whenever the camera or chain changes.
  let warpKey = "";
  useTask(() => {
    const view = camera.current;
    if (!view || !mark.warped()) return;
    const width = renderer.domElement.clientWidth, height = renderer.domElement.clientHeight;
    let chain;
    try { chain = resolveCoordinateOperations(heatmapOptions, { includePlacement: false }); } catch { return; }
    const key = JSON.stringify([view.projectionMatrix.elements, view.matrixWorldInverse.elements, width, height,
      heatmapOptions.get("xbounds"), heatmapOptions.get("ybounds"), chain]);
    if (key === warpKey) return;
    warpKey = key;
    mark.setWarpDetail(warpDetail(heatmapOptions, view, width, height,
      heatmapOptions.get("subdivisionTolerance") ?? 0.4));
  }, { autoInvalidate: false });

  export const getSurface = () => mark;
  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
</script>

<T is={mark} onpointermove={children ? () => {} : undefined} {...component.events} />
{#if children}<SurfaceChildren
    {mark}
    resolution={textureResolution}
    {children}
  />{/if}
