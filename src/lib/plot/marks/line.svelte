<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import {curveControls,ensureCurves,basisPath,basisAttribute} from "../utils/curves.js";
  import { SelectType } from "../objects/types.js";
  import { spherical } from "../utils/coordinates.js";
  import { uniform, uint } from "three/tsl";
  import { numpy as np, Array as JaxArray } from "@hmplot/jax";
  import { attachSurface } from "../utils/surface.js";
  import { T, useThrelte } from "@threlte/core";
  import { untrack, onDestroy } from "svelte";
  import { Segments } from "../objects/segments.js";
  import { ensureSegmentsOptions } from "../objects/defaultOptions.js";
  import {
    asArray,
    lineArrays,
    segmentAttribute,
    shapeOf,
    disposeArrays,
    updateFields,
  } from "../utils/data.js";
  import type { MarkProps } from "../publicTypes.js";
  let {
    surface = undefined,
    progress = undefined,
    position = undefined,
    color = "#4682b4",
    categoryColor = undefined,
    width = 1,
    name = undefined,
    options = undefined,
    positionSpace = undefined,
    // A connector's per-vertex endpoint offsets (connectionPrepare); not the public `offset`.
    pathOffset = undefined,
    // A padded view's valid-first rows (namedMark, TODO 17.3b): only the first rows form the line.
    _validCount = undefined,
    // Per-row widths from an expression of literals are pixels, as a literal (namedMark, TODO 62.4).
    _widthPixels = false,
    ...others
  }: MarkProps & Record<string, any> = $props();
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  let unsubscribe = () => {};
  const component = markComponent("Line", {
    name: () => name,
    setup: (parent) => ensureSegmentsOptions(parent),
    create: (local) => {
      local.ensure("sampling", new SelectType({defaultValue:"random",options:{Random:"random","Uniform X extrema":"uniform-x"}}));
      ensureCurves(local);
      const mark = new Segments(local, viewServices, invalidate, undefined, true);
      mark.componentName = "Line";
      return mark;
    },
    display: (display) => options ?? display,
    populate: () => ({
      ...others,
      ...(surface && !spherical(component.local)
        ? { maxElements: (others.maxElements ?? 2048) * 64 }
        : {}),
    }),
    handlers: () => others,
    cleanup: () => unsubscribe(),
  });
  const { mark, local } = component;
  export const getMark = () => mark;
  mark.progress = uniform(1);
  mark.transitionStart = uniform(uint(0));
  // Only a new surface re-attaches the mark (attaching rebuilds it). The props object is new on
  // every preparation, which would otherwise rerun this with the same surface on every update.
  const attachedSurface = $derived(surface);
  $effect(() => {
    const target = attachedSurface;
    return untrack(() => attachSurface(mark, target));
  });
  $effect(() => {
    mark.manualAnimation = progress !== undefined;
    mark.progress.value = progress ?? 1;
    invalidate();
  });
  let revision = $state(0);
  let pathCache, pathSource, pathCurve, pathAlpha, pathValidCount, pathWorld;
  onDestroy(() => { if (pathCache) disposeArrays(pathCache); });
  // The curve reshapes the segments: everything is recomputed. The axes (bounds, ranges and
  // transforms) change nothing here: a dashed Line measures its path on screen, on the GPU, for
  // every camera and chain (TODO 73.2; utils/dashDistances.js).
  const curveStops=['curve','curveAlpha'].map(key=>local.on(()=>revision++,key));
  unsubscribe=()=>curveStops.forEach(stop=>stop());
  $effect(() => {
    revision;
    const widthLiteral = typeof width === "number" || _widthPixels;
    if (mark.widthLiteral !== widthLiteral) {
      mark.widthLiteral = widthLiteral;
      mark.build();
    }
    // Connection-backed: positions are world coordinates (gathered through each endpoint's
    // frame), with optional per-vertex pixel offsets of displaced endpoints.
    const world = positionSpace === "world" ? "world" : undefined;
    const offsets = world !== undefined && pathOffset !== undefined && !surface && local.get("curve") !== "basis";
    if (mark.positionSpace !== world || mark.endpointOffsetActive !== offsets) {
      mark.positionSpace = world;
      mark.endpointOffsetActive = offsets;
      mark.build();
    }
    let values;
    try {
      const curve = local.get("curve"), alpha = local.get("curveAlpha");
      if (!pathCache || pathSource !== position || pathCurve !== curve || pathAlpha !== alpha || pathValidCount !== _validCount || pathWorld !== world) {
        const next = lineArrays(position, local, true, world !== undefined, _validCount);
        if (curve === 'basis' && shapeOf(next.start)[0]) {
          try { values = basisPath(next); } finally { disposeArrays(next); }
        } else {
          try { Object.assign(next, curveControls(next, "Line", curve, alpha)); values = next; }
          catch (error) { disposeArrays(next); throw error; }
        }
        if (pathCache) disposeArrays(pathCache);
        pathCache = values;
        pathSource = position; pathCurve = curve; pathAlpha = alpha; pathValidCount = _validCount;
        pathWorld = world;
      }
      values = Object.fromEntries(Object.entries(pathCache).map(([key, value]) => [key, value instanceof JaxArray ? value.ref : value]));
      mark.setDrawLimit(_validCount === undefined ? undefined : Math.max(0, _validCount - 1));
    } catch (error) {
      mark.count = 0;
      invalidate();
      component.report(error);
      return;
    }
    component.report();
    const n = shapeOf(position)[0];
    let colors = segmentAttribute(color, n);
    let widths = segmentAttribute(width, n);
    let categoryColors=categoryColor===undefined?undefined:segmentAttribute(categoryColor,n);
    mark.setCategoryColor(categoryColor !== undefined);
    if(local.get('curve')==='basis'){
      
      // A segment attribute that differs from the input owns a sliced JAX array.
      const c=colors,w=widths,cc=categoryColors;
      colors=basisAttribute(c);widths=basisAttribute(w);categoryColors=basisAttribute(cc);
      if(colors!==c&&c!==color)(c as JaxArray)?.dispose?.();if(widths!==w&&w!==width)(w as JaxArray)?.dispose?.();if(categoryColors!==cc&&cc!==categoryColor)cc?.dispose?.();
    }
    mark.transitionStart.value = Math.max(0, n - 2)*(local.get('curve')==='basis'?3:1);
    if (surface && !spherical(local) && n > 1) {
      values.previous = np.repeat(values.previous, 64, 0);
      values.next = np.repeat(values.next, 64, 0);
      values.start = np.repeat(values.start, 64, 0);
      values.end = np.repeat(values.end, 64, 0);
      values.distance = np.repeat(values.distance, 64, 0);
      mark.transitionStart.value = (n - 2) * 64;
      if ((colors as JaxArray)?.shape?.length)
        colors = np.repeat(colors === color ? (colors as JaxArray).ref : (colors as JaxArray), 64, 0);
      if(categoryColors?.shape)categoryColors=np.repeat(categoryColors===categoryColor?categoryColors.ref:categoryColors,64,0);
      if ((widths as JaxArray)?.shape?.length)
        widths = np.repeat(widths === width ? (widths as JaxArray).ref : (widths as JaxArray), 64, 0);
    }
    if (offsets && n > 1) {
      const vertex = asArray(pathOffset);
      values.endpointOffset = np.concatenate([vertex.ref.slice([0, -1]), vertex.slice([1])], 1);
    }
    updateFields(mark, { ...values, color: colors, width: widths, ...(categoryColors===undefined?{}:{categoryColor:categoryColors}) }, "start");
    disposeArrays(values);
    if(categoryColors!==categoryColor)disposeArrays({categoryColors});
    if (colors !== color) disposeArrays({ colors });
    if (widths !== width) disposeArrays({ widths });
  });
  export const getLegendSource = () => mark.guideHandle;
</script>

<T is={mark} {...component.events} />
