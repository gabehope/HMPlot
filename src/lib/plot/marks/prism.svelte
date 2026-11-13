<script lang="ts">
  import { coordinateView } from "../utils/viewContext.js";
  import { useViewServices } from "../utils/viewServices.js";
  import { ensureOutlineOptions, setOutlineColors, OUTLINE_KEYS } from "../objects/outlines.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { T, useThrelte } from "@threlte/core";
  import { untrack, getContext } from "svelte";
  import { ensureScatter3DOptions } from "../objects/defaultOptions.js";
  import { FieldType, SelectType } from "../objects/types.js";
  import { PrismObject } from "../objects/prism.js";
  import { rectangleArrays } from "../utils/rectangles.js";
  import { updateFields, disposeArrays } from "../utils/data.js";
  let {
    kind = "prism",
    fill = "#547ba2",
    categoryColor,
    categoryOutline, outlineWidth, outlineOpacity,
    name,
    options,
    // A keyed update's fade (namedMark), written with the other fields.
    _interactionOpacity = undefined,
    ...props
  }: any = $props();
  const { renderer, invalidate, camera } = useThrelte();
  const viewServices = useViewServices();
  const component = markComponent(untrack(() => (kind === "rect" ? "Rect" : "Prism")), {
    name: () => name,
    setup: (parent) => {
      const display = ensureScatter3DOptions(parent);
      if (kind === "rect") display.push(...ensureOutlineOptions(parent));
      parent.ensure("flat", new FieldType({ defaultValue: false, ui: false }));
      parent.ensure("extrusionAxis", new FieldType({ defaultValue: "z", ui: false }));
      return display;
    },
    create: (local) => {
      if (kind === "rect") ensureOutlineOptions(local);
      local.set("shape", untrack(() => (kind === "rect" ? "rectangle" : (props.shape ?? "rectangle"))));
      const shapeType = new SelectType({
        label: "Shape",
        options: ["rectangle", "triangle", "hexagon", "circle"],
      });
      local.presentationTypes.set("shape", { ...shapeType.ui(), type: shapeType });
      const mark = new PrismObject(local, viewServices, invalidate, kind === "rect");
      mark.componentName = kind === "rect" ? "Rect" : "Prism";
      return mark;
    },
    display: (display) =>
      options ??
      display.filter(
        (k) => (!OUTLINE_KEYS.includes(k) || kind === "rect") &&
          ![
            "scaleBounds",
            "scaleRange",
            "scaleTransform",
            "sizeAttenuation",
            "detail",
          ].includes(k),
      ),
    populate: () => ({
      ...(typeof outlineWidth === "number" ? { outlineWidth } : {}),
      ...(typeof outlineOpacity === "number" ? { outlineOpacity } : {}),
      ...Object.fromEntries(
        Object.entries(props).filter(
          ([k]) =>
            ![
              "x",
              "y",
              "z",
              "x0",
              "x1",
              "y0",
              "y1",
              "z0",
              "z1",
              "width",
              "depth",
              "rotation",
              "axis",
              "lit",
            ].includes(k),
        ),
      ),
      ...(kind === "rect"
        ? { shape: "rectangle" }
        : props.shape !== undefined
          ? { shape: props.shape }
          : {}),
      extrusionAxis: props.axis ?? "z",
      flat:
        (kind === "rect" && props.z0 === undefined) ||
        ((props.axis ?? "z") === "z" &&
          typeof props.z0 === "number" &&
          props.z0 === props.z1),
      ...(props.lit === undefined ? {} : { lit: props.lit }),
    }),
    handlers: () => props,
  });
  const { mark, local } = component;
  const painted = getContext("hmplot-surface-children");
  $effect(() => {
    try {
      if (
        painted &&
        !(kind === "rect" && props.z0 === undefined) &&
        !(props.z0 === 0 && props.z1 === 0 && (props.axis ?? "z") === "z")
      )
        throw Error(
          "Heatmap texture children support flat footprints, not extruded columns.",
        );
      if (props.surface)
        throw Error("Prisms do not support standalone surface attachment.");
      // In a 2D spherical frame a flat rectangle is a lon/lat patch: its edges
      // follow meridians and parallels (prism.js refinesChain, interpolationOf).
      const flat = (kind === "rect" || (props.z0 ?? 0) === 0 && (props.z1 ?? 0) === 0) &&
        (props.axis ?? "z") === "z" && (props.shape ?? "rectangle") === "rectangle";
      if (local.get("coordinates") === "spherical" && !(flat && coordinateView(local) === "2d"))
        throw Error("Rect and Prism require Cartesian coordinates, except a flat rectangle in a 2D spherical frame.");
      // The former spherical-orthographic sector put its radial extent in z.
      if (local.get("coordinates") === "spherical" && typeof props.z0 === "number" &&
          typeof props.z1 === "number" && props.z0 !== props.z1)
        throw Error("In a spherical frame a Rect is a longitude/latitude box at one radius, so z0 and z1 must be equal; " +
          'for an annular sector, use coordinates="polar" with angle x and radius y bounds.');
      const data = rectangleArrays(kind, props);
      component.report();
      if (mark.turnActive !== (props.rotation !== undefined)) {
        mark.turnActive = props.rotation !== undefined;
        mark.build();
      }
      mark.setCategoryColor(categoryColor !== undefined);
      if (mark.hasOutlines) setOutlineColors(mark, categoryOutline !== undefined);
      updateFields(mark, {
        ...data,
        fill,
        ...(mark.hasOutlines ? { outlineWidth: outlineWidth ?? local.get("outlineWidth"),
          outlineOpacity: outlineOpacity ?? local.get("outlineOpacity"),
          ...(categoryOutline === undefined ? {} : { categoryOutline }) } : {}),
        ...(categoryColor === undefined ? {} : { categoryColor }),
        ...(_interactionOpacity === undefined ? {} : { interactionOpacity: _interactionOpacity }),
      }).finally(() => disposeArrays(data));
    } catch (e) {
      component.report(e);
    }
  });
  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
</script>

<T is={mark} {...component.events} />
