<script lang="ts">
  import { coordinateView } from "../utils/viewContext.js";
  import { useViewServices } from "../utils/viewServices.js";
  import { ensureOutlineOptions, setOutlineColors } from "../objects/outlines.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { T, useThrelte, useTask } from "@threlte/core";
  import { untrack } from "svelte";
  import { ensureScatter3DOptions } from "../objects/defaultOptions.js";
  import { PolarRectObject } from "../objects/polarRect.js";
  import { rectangleArrays } from "../utils/rectangles.js";
  import { updateFields, disposeArrays, asArray } from "../utils/data.js";
  import { FieldType } from "../objects/types.js";
  import { angularPeriod } from "../utils/coordinates.js";
  import { ringSegments, ringPixelsPerUnit } from "../utils/surfaceGeometry.js";
  import { numpy as np } from "@hmplot/jax";
  import { trackPreparation } from "../rendering/viewSettlement.js";
  let { fill = "#547ba2", categoryColor, categoryOutline, outlineWidth, outlineOpacity, name, options, _interactionOpacity = undefined, ...props }: any = $props();
  const { renderer, invalidate, camera } = useThrelte();
  const viewServices = useViewServices();
  const component = markComponent("Polar Rect", {
    name: () => name,
    setup: (parent) => {
      const display = ensureScatter3DOptions(parent);
      display.push(...ensureOutlineOptions(parent));
      parent.ensure("flat", new FieldType({ defaultValue: true, ui: false }));
      parent.ensure("extrusionAxis", new FieldType({ defaultValue: "z", ui: false }));
      return display;
    },
    create: (local) => { ensureOutlineOptions(local); return new PolarRectObject(local, viewServices, invalidate); },
    display: (display) => options ?? display.filter((key) => !["shape","rotation","detail","sizeAttenuation"].includes(key)),
    populate: () => ({
      ...(typeof outlineWidth === "number" ? { outlineWidth } : {}),
      ...(typeof outlineOpacity === "number" ? { outlineOpacity } : {}), ...Object.fromEntries(Object.entries(props).filter(([key]) => !["x0","x1","y0","y1","z0","z1"].includes(key))), flat: true, extrusionAxis: "z", shape: "rectangle" }),
    handlers: () => props,
  });
  const { mark, local } = component;
  // Enough segments that the arcs look round at the size the frame is drawn (device pixels),
  // measured every frame (placement, insets and the camera move it); setSectorSegments acts only
  // when the count (a multiple of 8) changes. The drawn size (CSS pixels per unit of radius) is kept
  // for a Pie's labels.
  useTask(() => {
    const view = camera.current;
    if (!view) return;
    const ratio = renderer.getPixelRatio?.() ?? 1,
      perUnit = ringPixelsPerUnit(local, view, renderer.domElement.clientWidth * ratio, renderer.domElement.clientHeight * ratio),
      yb = local.get("ybounds") ?? [0, 1];
    mark.setPixelsPerUnit(perUnit / ratio);
    const share = Math.min(1, Math.max(0, mark.widestSpan / angularPeriod(local)));
    mark.setSectorSegments((Number.isFinite(share) ? share : 1) * ringSegments(perUnit * Math.max(Math.abs(yb[0]), Math.abs(yb[1])), local.get("subdivisionTolerance") ?? 0.5));
  }, { autoInvalidate: false });
  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
  $effect(() => {
    let data;
    try {
      if (local.get("coordinates") !== "polar" || coordinateView(local) !== "2d")
        throw Error("Annular Rect sectors require 2D polar coordinates with X angle and Y radius bounds.");
      if (props.y0 === undefined || props.y1 === undefined) throw Error("Polar Rect requires y0 and y1 radial bounds.");
      if ((typeof props.z0 === "number" && props.z0 !== 0) || (typeof props.z1 === "number" && props.z1 !== 0))
        throw Error("Polar Rect requires zero height bounds.");
      const revolution = untrack(() => angularPeriod(local));
      if (typeof props.x0 === "number" && typeof props.x1 === "number" && (props.x1 < props.x0 || props.x1 - props.x0 > revolution))
        throw Error("Polar Rect angles must be ordered and span at most one revolution.");
      data = rectangleArrays("rect", props);
      mark.setCategoryColor(categoryColor !== undefined);
      if (mark.hasOutlines) setOutlineColors(mark, categoryOutline !== undefined);
      updateFields(mark, { ...data, fill, outlineWidth: outlineWidth ?? local.get("outlineWidth"),
        outlineOpacity: outlineOpacity ?? local.get("outlineOpacity"),
        ...(categoryOutline === undefined ? {} : { categoryOutline }), ...(categoryColor === undefined ? {} : { categoryColor }), ...(_interactionOpacity === undefined ? {} : { interactionOpacity: _interactionOpacity }) });
      component.report();
      measureSpan(props.x0, props.x1);
    } catch (error) { component.report(error); }
    finally { if (data) disposeArrays(data); }
  });
  // The widest sector, in angle units (one reduction and readback per data change): the shared
  // mesh spreads its segments over each sector's own span, so the widest needs the turn's count
  // times its share of a turn (the per-frame task divides by the current turn). Every reading
  // applies, as the larger of it and the reading before (a tween passes between the two);
  // before the first, a whole turn.
  let previous = 0;
  function measureSpan(x0, x1) {
    const settle = (span) => {
      const width = Number.isFinite(span) ? Math.max(0, span) : Infinity;
      mark.setWidestSpan(Math.max(previous, width));
      previous = width;
      invalidate();
    };
    if (typeof x0 === "number" && typeof x1 === "number") return settle(x1 - x0);
    let widths;
    try {
      if (typeof x1 === "number") widths = asArray(x0).mul(-1).add(x1);
      else if (typeof x0 === "number") widths = asArray(x1).sub(x0);
      else {
        const hi = asArray(x1);
        let lo;
        try { lo = asArray(x0); } catch (error) { hi.dispose(); throw error; }
        widths = hi.sub(lo);
      }
    } catch { return settle(NaN); }
    const widest = np.max(np.where(np.isfinite(widths.ref), widths, 0));
    trackPreparation(viewServices, widest.data().then((value) => settle(Number(value[0] ?? value)), () => settle(NaN)));
  }
</script>
<T is={mark} {...component.events} />
