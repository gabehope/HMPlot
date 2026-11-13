<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  // Solid arrows. Screen-sized arrows compose Segments (compound/arrows.js).
  import { markComponent } from "../utils/markComponent.svelte.js";
  import {curveControls,ensureCurves} from "../utils/curves.js";
  import { T, useThrelte } from "@threlte/core";
  import { ensureSegmentsOptions } from "../objects/defaultOptions.js";
  import { ScalarType, BooleanType } from "../objects/types.js";
  import { Arrows3D as ArrowsObject } from "../objects/arrows.js";
  import { updateFields, disposeArrays, asArray } from "../utils/data.js";
  import { numpy as np } from "@hmplot/jax";
  import { arrowArrays } from "../binding/arrowInputs.js";
  import type { MarkProps } from "../publicTypes.js";
  let {
    start = undefined,
    end = undefined,
    control1 = undefined,
    control2 = undefined,
    width = undefined,
    color = "#4682b4",
    categoryColor = undefined,
    name = undefined,
    options = undefined,
    positionSpace = undefined,
    startOffset = undefined,
    endOffset = undefined,
    // A keyed update's fade (namedMark), written with the other fields.
    _interactionOpacity = undefined,
    // Per-row widths from an expression of literals mean what a literal does (namedMark, TODO 62.4).
    _widthPixels = false,
    ...others
  }: MarkProps & Record<string, any> = $props();
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  let curveRevision = $state(0), curveStops = [];
  const component = markComponent("Arrows3D", {
    name: () => name,
    setup: (parent) => {
      const display = ensureSegmentsOptions(parent);
      // Solid arrowhead dimensions are in world units.
      parent.ensure("headLength", new ScalarType({ defaultValue: 3, min: 0, max: 20 }));
      parent.ensure("headWidth", new ScalarType({ defaultValue: 2, min: 0, max: 20 }));
      parent.ensure("lit", new BooleanType());
      return display;
    },
    create: (local) => {
      // This kind's own head size, unless the mark or its plot sets one (TODO 32.3).
      local.setKindDefault("headLength", 3);
      local.setKindDefault("headWidth", 2);
      ensureCurves(local, "Segments");
      curveStops = ["curve", "curveAlpha"].map((key) => local.on(() => curveRevision++, key));
      return new ArrowsObject(local, viewServices, invalidate);
    },
    display: (display) =>
      options ?? [...display.filter((k) => !["dashed", "dashSize", "gapSize"].includes(k)), "headLength", "headWidth", "lit"],
    populate: () => others,
    cleanup: () => curveStops.forEach((stop) => stop()),
  });
  const { mark, local } = component;
  $effect(() => {
    curveRevision;
    const widthValue = width ?? 0.05;
    const widthLiteral = typeof widthValue === "number" || _widthPixels;
    if (mark.widthLiteral !== widthLiteral) {
      mark.widthLiteral = widthLiteral;
      mark.build();
    }
    // Connection-backed: world coordinates, optional endpoint pixel offsets.
    const world = positionSpace === "world" ? "world" : undefined;
    const offsets = world !== undefined && startOffset !== undefined && endOffset !== undefined;
    if (mark.positionSpace !== world || mark.endpointOffsetActive !== offsets) {
      mark.positionSpace = world;
      mark.endpointOffsetActive = offsets;
      mark.build();
    }
    let values;
    try {
      values = arrowArrays({ start, end, width: widthValue, color });
      if (offsets) values.endpointOffset = np.concatenate([asArray(startOffset), asArray(endOffset)], 1);
      Object.assign(values,curveControls({...values,control1,control2},"Arrows3D",local.get("curve"),local.get("curveAlpha")));
      mark.setCategoryColor(categoryColor !== undefined);
      updateFields(mark, {...values,...(categoryColor===undefined?{}:{categoryColor}),...(_interactionOpacity === undefined ? {} : { interactionOpacity: _interactionOpacity })}, "start");
      component.report();
    } catch (error) {
      mark.count = 0;
      invalidate();
      component.report(error);
    } finally {
      if (values) disposeArrays(values);
    }
  });
  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
</script>

<T is={mark} {...component.events} />
