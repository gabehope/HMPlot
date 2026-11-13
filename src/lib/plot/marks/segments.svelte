<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import {curveControls,ensureCurves} from "../utils/curves.js";
  import { updateFields,disposeArrays,asArray } from "../utils/data.js";
  import { numpy as np } from "@hmplot/jax";
  import { T, useThrelte } from "@threlte/core";
  import { untrack } from "svelte";
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  import { Segments as SegmentsObject } from "../objects/segments.js";
  import { ensureSegmentsOptions } from "../objects/defaultOptions.js";

  import type { MarkProps } from "../publicTypes.js";
  let {
    start = undefined,
    end = undefined,
    control1 = undefined,
    control2 = undefined,
    width = undefined,
    color = undefined,
    categoryColor = undefined,
    name = undefined,
    options = undefined,
    positionSpace = undefined,
    startOffset = undefined,
    endOffset = undefined,
    // A keyed update's fade (namedMark), written with the other fields.
    _interactionOpacity = undefined,
    // Per-row widths from an expression of literals are pixels, as a literal (namedMark, TODO 62.4).
    _widthPixels = false,
    // Which end components are the frame edge (namedMark; utils/frameEdges.js).
    _frameEdges = null,
    ...others
  }: MarkProps & Record<string, any> = $props();

  let curveRevision = $state(0), curveStops = [], autoCubic = false;
  const component = markComponent("Segments", {
    name: () => name,
    setup: (parent) => ensureSegmentsOptions(parent),
    create: (local) => {
      local.setKindDefault("headLength", 10);
      local.setKindDefault("headWidth", 8);
      ensureCurves(local, "Segments");
      curveStops = ["curve", "curveAlpha"].map((key) => local.on(() => curveRevision++, key));
      return new SegmentsObject(local, viewServices, invalidate);
    },
    // cap="bar" (TODO 130.1) shows its size in the settings pane, as ErrorBars does.
    display: (defaults) => options ?? (others.cap === "bar" ? [...defaults, "capSize"]
      : others.cap === "arrow" ? [...defaults, "headLength", "headWidth"] : defaults),
    populate: () => others,
    cleanup: () => curveStops.forEach((stop) => stop()),
  });
  const { mark, local: segmentsOptions } = component;

  $effect(() => {
    curveRevision;
    const widthLiteral = width === undefined || typeof width === "number" || _widthPixels;
    if (mark.widthLiteral !== widthLiteral) {
      mark.widthLiteral = widthLiteral;
      mark.build();
    }
    mark.setCategoryColor(categoryColor !== undefined);
    mark.setFrameEdges(_frameEdges);
    // Connection-backed: world coordinates, optional endpoint pixel offsets.
    const world = positionSpace === "world" ? "world" : undefined;
    const offsets = world !== undefined && startOffset !== undefined && endOffset !== undefined;
    if (mark.positionSpace !== world || mark.endpointOffsetActive !== offsets) {
      mark.positionSpace = world;
      mark.endpointOffsetActive = offsets;
      mark.build();
    }
    // Control points alone draw cubic Béziers (as the Links mark did), unless curve names another.
    const automatic = others.curve === undefined, controlled = control1 !== undefined || control2 !== undefined;
    if (automatic && controlled !== autoCubic) {
      autoCubic = controlled;
      untrack(() => segmentsOptions.set("curve", controlled ? "cubic" : "linear"));
    }
    // An automatic cubic with one control point takes the segment's end for the other (as Links did).
    const cubic = automatic && controlled;
    const controls=curveControls({start,end,control1:cubic?control1??start:control1,control2:cubic?control2??end:control2},"Segments",segmentsOptions.get("curve"),segmentsOptions.get("curveAlpha"));
    if (offsets) controls.endpointOffset = np.concatenate([asArray(startOffset), asArray(endOffset)], 1);
    updateFields(
      mark,
      { start, end, ...controls, color: color ?? "#4682b4", width: width ?? 1, ...(categoryColor===undefined?{}:{categoryColor}), ...(_interactionOpacity === undefined ? {} : { interactionOpacity: _interactionOpacity }) },
      "start",
    );
    disposeArrays(controls);
  });

  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
</script>

<T is={mark} {...component.events} />
