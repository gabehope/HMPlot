<script lang="ts">
  import { coordinateViewStore } from "../utils/viewContext.js";
  import { useViewServices } from "../utils/viewServices.js";
  import { ensureOutlineOptions, setOutlineColors } from "../objects/outlines.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { T, useThrelte } from "@threlte/core";
  import { untrack } from "svelte";
  import { reportDataError } from "../utils/dataErrors.js";
  import { ensureSegmentsOptions } from "../objects/defaultOptions.js";
  import { ScalarType } from "../objects/types.js";
  import { Uncertainty } from "../objects/uncertainty.js";
  import { uncertaintyArrays } from "../utils/uncertainty.js";
  import {
    updateFields,
    disposeArrays,
    validateFields,
    segmentAttribute,
    shapeOf,
  } from "../utils/data.js";
  let {
    kind = "area",
    x,
    lower,
    upper,
    startLower,
    endLower,
    startUpper,
    endUpper,
    position,
    axis = "y",
    capSize = 6,
    fill = "#547ba2",
    color = "#30343b",
    categoryColor = undefined,
    width = 1,
    opacity = kind === "errors" ? 1 : 0.2,
    outlineColor = "#30343b",
    outlineWidth = undefined,
    outlineOpacity = undefined,
    categoryOutline = undefined,
    name,
    options,
    surface,
    // A padded view's valid rows (TODO 17.14c): the others read as missing. Borrowed.
    _rowShown = undefined,
    // A keyed update's fade (namedMark; ErrorBars), written with the other fields.
    _interactionOpacity = undefined,
    ...others
  }: any = $props();
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  const PIXEL_OUTLINE = new ScalarType({ defaultValue: 0, min: 0, max: 20, label: "Outline width" });
  // A second error source, scoped apart from the data's: the 3D spherical view check below.
  const coordinateOwner = {};
  const component = markComponent(
    untrack(() => (kind === "errors" ? "Error bars" : kind === "flow" ? "Flow" : "Area")),
    {
      name: () => name,
      setup: (parent) => {
        const display = ensureSegmentsOptions(parent);
        parent.ensure("capSize", new ScalarType({ defaultValue: 6, min: 0 }));
        if (kind !== "errors") display.push(...ensureOutlineOptions(parent));
        parent.ensure("uncertaintyAxis", new ScalarType({ defaultValue: 1, ui: false }));
        return display;
      },
      create: (local, parent) => {
        // Its own outline slider, whichever mark defined the shared option first (TODO 32.3).
        local.presentationTypes.set("outlineWidth", { ...PIXEL_OUTLINE.ui(), type: PIXEL_OUTLINE });
        local.set("opacity", untrack(() => opacity));
        if (parent.owner("widthRange") === parent.definitionRoot) local.set("widthRange", [0, 1]);
        local.allowCrossing = untrack(() => kind === "area");
        const object = new Uncertainty(local, viewServices, invalidate, untrack(() => kind !== "errors"));
        // Named in messages and export reports by its component (TODO 67.6).
        object.componentName = untrack(() => ({ errors: "ErrorBars", area: "Area", flow: "Flow" })[kind] ?? "Area");
        return object;
      },
      display: (display) => options ?? (kind === "errors" ? [...display, "capSize"] : display.filter(k => !["dashed", "dashSize", "gapSize", "width", "widthBounds", "widthRange", "widthTransform"].includes(k))),
      populate: () => ({ ...others, opacity, capSize, ...(kind !== "errors" ? { outlineColor,
        ...(typeof outlineWidth === "number" ? { outlineWidth } : {}),
        ...(typeof outlineOpacity === "number" ? { outlineOpacity } : {}) } : {}), uncertaintyAxis: axis === "x" ? 0 : 1 }),
      handlers: () => others,
      cleanup: () => reportDataError(viewServices, coordinateOwner, ""),
    },
  );
  const { mark, local } = component;
  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
  let builtShape; // the width kind and axis the mark was last built for (the first run builds)
  $effect(() => {
    // The shader depends on whether the width is one number or per row and on the axis; the
    // other options rebuild the mark themselves (Segments' options) or are uniforms. Rebuilding
    // on every update (a new width array per preparation) compiled pipelines on each brush move
    // (TODO 17.14c).
    const widthLiteral = typeof width === "number", shape = `${widthLiteral}:${axis}`;
    if (mark.widthLiteral !== widthLiteral) mark.widthLiteral = widthLiteral;
    if (builtShape !== shape) {
      mark.build();
      builtShape = shape;
    }
  });
  // The value axis's transform: bounds outside its domain are missing (TODO 67.1).
  const xTransform = local.store("xTransform"), yTransform = local.store("yTransform");
  $effect(() => {
    let values;
    const transform = (axis === "x" ? $xTransform : $yTransform) ?? "linear";
    try {
      if (surface)
        throw Error(
          "Uncertainty marks do not support standalone surface attachment. Use heatmap children.",
        );
      values = kind === "flow"
        ? { start: startLower, end: endLower, previous: startUpper, next: endUpper }
        : uncertaintyArrays(
          kind === "errors" ? "errors" : kind,
          kind === "errors" ? position : x,
          lower,
          upper,
          axis,
          _rowShown,
          transform,
        );
      const count = kind === 'flow' ? shapeOf(startLower)[0] : shapeOf(x)[0];
      const sourceColor = kind === "errors" ? color : fill;
      const fieldColor =
        kind === "errors" ? color : segmentAttribute(fill, count);
      try {
        const cc=categoryColor===undefined?undefined:kind==='errors'?categoryColor:segmentAttribute(categoryColor,count);
        mark.setCategoryColor(categoryColor !== undefined);
        if (kind !== "errors") setOutlineColors(mark, categoryOutline !== undefined);
        const border = kind === "errors" ? {} : Object.fromEntries(Object.entries({
          outlineWidth: outlineWidth ?? local.get("outlineWidth"),
          outlineOpacity: outlineOpacity ?? local.get("outlineOpacity"),
          ...(categoryOutline === undefined ? {} : { categoryOutline }),
        }).map(([key, value]) => [key, kind === "flow" ? value : segmentAttribute(value, count)]));
        const fields = { ...values, ...border, color: fieldColor, width, ...(cc===undefined?{}:{categoryColor:cc}), ...(_interactionOpacity === undefined ? {} : { interactionOpacity: _interactionOpacity }) };
        try {
          validateFields(fields, "start");
          updateFields(mark, fields, "start");
        } finally {
          // A field takes its own reference when it is updated: release now.
          if (cc !== categoryColor) disposeArrays({ cc });
          disposeArrays(Object.fromEntries(Object.entries(border).filter(([key,value]) => value !== ({outlineWidth,outlineOpacity,categoryOutline})[key])));
        }
        component.report();
      } finally {
        if (fieldColor !== sourceColor) disposeArrays({ color: fieldColor });
      }
    } catch (e) {
      component.report(e);
    } finally {
      if (values && kind !== 'flow') disposeArrays(values);
    }
  });
  // In a 2D spherical frame bands and error bars are lon/lat pieces through
  // the chain (interpolationOf); a 3D globe has no such path yet.
  const coordinates = local.store("coordinates"), view = coordinateViewStore(local);
  $effect(() => {
    reportDataError(viewServices, coordinateOwner, $coordinates === "spherical" && $view === "3d"
      ? "Uncertainty marks in a 3D spherical view are not supported yet; use a 2D Plot." : "");
  });
</script>

<T is={mark} {...component.events} />
