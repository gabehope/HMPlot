import { ensureOutlineOptions, OUTLINE_KEYS } from "./outlines.js";
import { ensureAnimation } from "../utils/animation.js";
import { DEFAULT_FONT } from "../utils/defaultFont.js";
import { ensureCoordinates } from "../utils/coordinates.js";
import { displayMultiplier } from "../utils/sampling.js";
import { shapeNames } from "../utils/shapes.js";
import { MISSING_COLOR } from "../utils/colormap.js";
import {
  BooleanType,
  BoundsType,
  ColorType,
  ColormapType,
  CountType,
  IntegerType,
  RangeType,
  ScalarType,
  FieldType,
  SelectType,
  TransformType,
  ValueType,
  Vector2Type,
} from "./types.js";

const UNIT_RANGE = [-50, 50];

const baseDisplay = [
  "label", "legend", "visible", "blend", "glow", "legendFontSize", "legendFontFamily", "legendTextColor", "legendTickFormat",
  "animation", "animationDuration", "animationEasing",
  "maxInstances",
  "maxElements",
  "quantize",
  "cmapIndex",
  "levels",
  "valueTransform",
  "valueBounds",
  "valueRange",
  "xTransform",
  "xInvert",
  "xbounds",
  "xrange",
  "yTransform",
  "yInvert",
  "ybounds",
  "yrange",
  "zTransform",
  "zInvert",
  "zbounds",
  "zrange",
];

const scatterDisplay = [
  "outlineColor",
  "outlineWidth",
  "outlineOpacity",
  "shape",
  "detail",
  "lit",
  "transparent",
  "sizeUnits",
  "opacity",
  "fillColor",
  "scaleTransform",
  "scaleBounds",
  "scaleRange",
  ...baseDisplay,
];

const heatmapDisplay = [
  "zScale",
  "detail",
  "lit",
  "transparent",
  "sizeAttenuation",
  "depthtest",
  "opacity",
  "fillColor",
  "scaleTransform",
  "scaleBounds",
  "scaleRange",
  ...baseDisplay,
  "contour",
  "grid",
];

const segmentsDisplay = [
  "curve", "curveAlpha",
  "fillColor",
  "opacity",
  "dashed",
  "dashSize",
  "gapSize",
  "transparent",
  "widthTransform",
  "widthBounds",
  "widthRange",
  ...baseDisplay,
];

// Anchor has no appearance: its settings are its animation and the position chain.
const anchorDisplay = [
  "animation", "animationDuration", "animationEasing", "maxElements",
  "xTransform", "xInvert", "xbounds", "xrange",
  "yTransform", "yInvert", "ybounds", "yrange",
  "zTransform", "zInvert", "zbounds", "zrange",
];

const contourDisplay = ["enabled", "width", "feather", "color", "strength"];
const gridDisplay = [
  "enabled",
  "polar",
  "offset",
  "cells",
  "cellsWidth",
  "cellColor",
  "sections",
  "sectionsWidth",
  "sectionColor",
  "strength",
];

function ensureBaseOptions(node) {
  node.ensure('legendFontSize',new ScalarType({defaultValue:12,min:8,max:32}));
  node.ensure('legendFontFamily',new FieldType({defaultValue:DEFAULT_FONT,ui:{ui:'text'}}));
  node.ensure('legendTextColor',new ColorType({defaultValue:'#40505d'}));
  node.ensure('legendTickFormat',new FieldType({defaultValue:'.3~g',ui:{ui:'text'}}));
  node.ensure('label',new FieldType({defaultValue:'',ui:{ui:'text'}}));
  node.ensure('legend',new BooleanType({defaultValue:true}));
  node.ensure('visible',new BooleanType({defaultValue:true}));
  node.ensure("blend", new SelectType({ defaultValue: "normal", options: ["normal", "additive", "multiply", "screen", "subtractive"] }));
  // A glowing mark's bloom (TODO 37.3): a uniform the beauty pass reads per object.
  node.ensure("glow", new ScalarType({ defaultValue: 0, min: 0, max: 5, step: 0.1, label: "Glow" }));
  // A plugin's shade (TODO 138.3): { kind, ...parameters }, read by the mark (objects/base.js).
  node.ensure("shade", new FieldType({ defaultValue: null, ui: false }));
  ensureAnimation(node);
  ensureCoordinates(node);
  node.ensure(
    "displayScale",
    new ScalarType({
      defaultValue: 1,
      min: 0,
      step: 0.05,
      transform: displayMultiplier,
    }),
  );
  node.ensure(
    "maxInstances",
    new FieldType({ defaultValue: null, ui: { ui: "text" } }),
  );
  node.ensure(
    "maxElements",
    new CountType({
      defaultValue: 250000,
      min: 1,
      max: 500000,
      step: 1000,
    }),
  );
  node.ensure("quantize", new BooleanType());
  node.ensure("valueTransform", new TransformType());
  ensureScaleChannel(node, "value");
  node.ensure("xTransform", new TransformType());
  node.ensure("yTransform", new TransformType());
  node.ensure("zTransform", new TransformType());
  // An axis's symlog constant (its `constant`): a uniform, so a new one compiles nothing.
  for (const axis of "xyz") node.ensure(`${axis}TransformConstant`, new ScalarType({ defaultValue: 1, min: 0.001, max: 1000, ui: false }));
  node.ensure("cmapIndex", new ColormapType({ defaultValue: "Viridis" }));
  // A missing value's color in a colormapped channel (TODO 73.3): a theme's `missing` sets it at
  // the root, a scale's `missing` on the mark.
  node.ensure("valueMissing", new ColorType({ defaultValue: MISSING_COLOR, label: "Missing values", ui: false }));
  node.ensure(
    "levels",
    new IntegerType({
      defaultValue: 10,
      min: 1,
      max: 2147483647,
      ui: { sliderMin: 1, sliderMax: 100, integer: true },
    }),
  );
  node.ensure("valueBounds", new BoundsType({ defaultValue: [0, 1] }));
  node.ensure("valueRange", new RangeType({ defaultValue: [0, 1] }));
}

function ensurePositionOptions(node, range = UNIT_RANGE) {
  node.ensure(
    "xbounds",
    new BoundsType({ defaultValue: [-1, 1], min: -100, max: 100 }),
  );
  node.ensure(
    "xrange",
    new RangeType({ defaultValue: range, min: -100, max: 100 }),
  );
  node.ensure(
    "ybounds",
    new BoundsType({ defaultValue: [-1, 1], min: -100, max: 100 }),
  );
  node.ensure(
    "yrange",
    new RangeType({ defaultValue: range, min: -100, max: 100 }),
  );
  node.ensure(
    "zbounds",
    new BoundsType({ defaultValue: [-1, 1], min: -100, max: 100 }),
  );
  node.ensure(
    "zrange",
    new RangeType({ defaultValue: range, min: -100, max: 100 }),
  );
  // Reverse the direction of an axis on screen; implemented as a reversed output range.
  for (const axis of "xyz") node.ensure(axis + "Invert", new BooleanType({ defaultValue: false }));
}

/**
 * A scaled channel's symlog constant and midpoint (TODO 39.1-39.2). Its scale resource sets them
 * (continuous({ constant, midpoint })); both reach the shader as uniforms.
 */
function ensureScaleChannel(node, prefix) {
  node.ensure(`${prefix}TransformConstant`, new ScalarType({ defaultValue: 1, min: 0.001, max: 1000, ui: false }));
  node.ensure(`${prefix}Midpoint`, new FieldType({ defaultValue: null, ui: false }));
}

function ensureScaleOptions(node) {
  node.ensure("scaleTransform", new TransformType());
  ensureScaleChannel(node, "scale");
  node.ensure("scaleBounds", new BoundsType({ defaultValue: [0, 1] }));
  node.ensure(
    "scaleRange",
    new RangeType({ defaultValue: [0, 0.5], min: 0, max: 5 }),
  );
}

function ensureSurfaceOptions(node) {
  node.ensure("lit", new BooleanType());
  node.ensure("sizeAttenuation", new BooleanType({ defaultValue: true }));
  node.ensure("fillColor", new ColorType({ defaultValue: "#ffffff" }));
  node.ensure("opacity", new ScalarType({ defaultValue: 1.0 }));
}

function ensureShapeOptions(node) {
  node.ensure(
    "shape",
    new SelectType({
      defaultValue: "circle",
      label: "Shape",
      options: ["circle", "square", "sphere", "cube"],
    }),
  );
  node.ensure(
    "detail",
    new IntegerType({ defaultValue: 10, min: 0, max: 100, step: 1 }),
  );
}

// Every outline width is CSS pixels, points too (TODO 133.5).
const POINT_OUTLINE = new ScalarType({ defaultValue: 0, min: 0, max: 20, label: "Outline width", step: 0.25 });
function ensureScatterOptions(node, transparentType = new BooleanType()) {
  node.ensure(
    "rotation",
    new ScalarType({ defaultValue: 0, min: -360, max: 360, step: 1 }),
  );
  node.ensure(
    "outlineColor",
    new ColorType({ defaultValue: "#302538", label: "Outline color" }),
  );
  node.ensure("outlineWidth", POINT_OUTLINE);
  ensureOutlineOptions(node);
  ensureBaseOptions(node);
  ensurePositionOptions(node);
  ensureScaleOptions(node);
  ensureSurfaceOptions(node);
  ensureShapeOptions(node);
  node.ensure("transparent", transparentType);
  // "px": CSS pixels whatever the zoom. "data": a length in data units of the x axis, so a
  // size-1 square tiles a unit grid and zooming scales the points.
  node.ensure("sizeUnits", new SelectType({ defaultValue: "px", options: { Pixels: "px", "Data units": "data" } }));
  return scatterDisplay;
}

function ensureScatter2DOptions(context) {
  return [...ensureScatterOptions(context), "rotation"];
}

function ensureScatterSpriteOptions(context) {
  return [...ensureScatterOptions(context), ...ensurePointOptions(context), "rotation"];
}

/** Options shared only by flat and solid points, rather than Scatter's other subclasses. */
function ensurePointOptions(context) {
  context.ensure("depthWrite", new BooleanType({ defaultValue: true }));
  return ["depthWrite"];
}

function ensureScatter3DOptions(context) {
  // Geometry in data units, with three's perspective attenuation as a real option.
  const display = ensureScatterOptions(context);
  return [...display.filter((key) => key !== "sizeUnits" && !OUTLINE_KEYS.includes(key)), "sizeAttenuation"];
}

/** Polygon's triangles (TODO 47.4): a Scatter's options, the outline in pixels (none by default). */
function ensurePolygonOptions(context) {
  context.ensure("outlineColor", new ColorType({ defaultValue: "#ffffff", label: "Outline color" }));
  context.ensure("outlineWidth", new ScalarType({ defaultValue: 0, min: 0, max: 8, step: 0.25, label: "Outline width" }));
  ensureScatterOptions(context);
  return ["visible", "opacity", "outlineColor", "outlineWidth", "outlineOpacity", "blend", "glow", "label", "legend"];
}

function ensureHeatmapOptions(context) {
  context.ensure("surfaceMode", new BooleanType({ defaultValue: false }));
  context.ensure("surface3d", new BooleanType({ defaultValue: false }));
  context.ensure(
    "zScale",
    new ScalarType({
      defaultValue: 0,
      label: "Height scale",
      min: 0,
      max: 100,
      step: 1,
    }),
  );
  context.ensure(
    "normalization",
    new SelectType({
      defaultValue: "auto",
      options: ["auto", "none", "symmetric"],
    }),
  );
  ensureBaseOptions(context);
  ensurePositionOptions(context);
  ensureScaleOptions(context);
  ensureSurfaceOptions(context);
  ensureShapeOptions(context);
  context.ensure("transparent", new BooleanType());
  context.ensure("depthtest", new BooleanType({ defaultValue: true }));
  context.ensure("contour-enabled", new BooleanType());
  context.ensure(
    "contour-width",
    new ValueType({ defaultValue: 1, min: 0, max: 10, step: 1 }),
  );
  context.ensure(
    "contour-feather",
    new ValueType({ defaultValue: 0.1, min: 0, max: 2, step: 0.01 }),
  );
  context.ensure("contour-color", new ColorType({ defaultValue: "#444444" }));
  context.ensure(
    "contour-strength",
    new ValueType({ defaultValue: 0.5, min: 0, max: 1, step: 0.01 }),
  );
  context.ensure("grid-enabled", new BooleanType());
  context.ensure("grid-polar", new BooleanType());
  context.ensure(
    "grid-offset",
    new Vector2Type({
      defaultValue: [0, 0],
      ui: { ui: "point", components: ["X", "Y"] },
    }),
  );
  context.ensure(
    "grid-cells",
    new Vector2Type({
      defaultValue: [10, 10],
      ui: {
        ui: "point",
        components: ["X", "Y"],
        min: 1,
        step: 1,
        integer: true,
      },
    }),
  );
  context.ensure(
    "grid-cellsWidth",
    new ValueType({ defaultValue: 1, min: 0, max: 10, step: 0.1 }),
  );
  context.ensure("grid-cellColor", new ColorType({ defaultValue: "#808080" }));
  context.ensure(
    "grid-sections",
    new Vector2Type({
      defaultValue: [5, 5],
      ui: {
        ui: "point",
        components: ["X", "Y"],
        min: 1,
        step: 1,
        integer: true,
      },
    }),
  );
  context.ensure(
    "grid-sectionsWidth",
    new ValueType({ defaultValue: 0.1, min: 0, max: 10, step: 0.1 }),
  );
  context.ensure(
    "grid-sectionColor",
    new ColorType({ defaultValue: "#cccccc" }),
  );
  context.ensure(
    "grid-strength",
    new ValueType({ defaultValue: 0.5, min: 0, max: 1, step: 0.01 }),
  );
  const contourOptions = context.ensureChild("contour");
  const gridOptions = context.ensureChild("grid");
  if (!contourOptions.hasOwnDisplayList)
    contourOptions.setDisplayList(contourDisplay);
  if (!gridOptions.hasOwnDisplayList) gridOptions.setDisplayList(gridDisplay);
  return heatmapDisplay;
}

function ensureSegmentsOptions(context) {
  context.ensure("headLength", new ScalarType({ defaultValue: 10, min: 0, max: 40 }));
  context.ensure("headWidth", new ScalarType({ defaultValue: 8, min: 0, max: 40 }));
  context.ensure("fillColor", new ColorType({ defaultValue: "#4682b4" }));
  context.ensure(
    "opacity",
    new ScalarType({ defaultValue: 1, min: 0, max: 1 }),
  );
  ensureBaseOptions(context);
  ensurePositionOptions(context);
  context.ensure("depthtest", new BooleanType({ defaultValue: true }));
  context.ensure("widthTransform", new TransformType());
  ensureScaleChannel(context, "width");
  context.ensure("transparent", new BooleanType());
  context.ensure("widthBounds", new BoundsType({ defaultValue: [0, 1] }));
  context.ensure("widthRange", new RangeType({ defaultValue: [0, 20] }));
  context.ensure("dashed", new BooleanType());
  // CSS pixels along the drawn path (TODO 73.2): `dash: true` draws 4 px dashes and gaps, as a
  // Rule's does.
  context.ensure(
    "dashSize",
    new ScalarType({ defaultValue: 4, min: 0.01, max: 40 }),
  );
  context.ensure(
    "gapSize",
    new ScalarType({ defaultValue: 4, min: 0.01, max: 40 }),
  );
  return segmentsDisplay;
}

function ensureAnchorOptions(context) {
  ensureBaseOptions(context);
  ensurePositionOptions(context);
  return anchorDisplay;
}

export {
  ensureAnchorOptions,
  ensureHeatmapOptions,
  ensurePolygonOptions,
  ensureScatter2DOptions,
  ensureScatter3DOptions,
  ensureScatterSpriteOptions,
  ensurePointOptions,
  ensureSegmentsOptions,
};

/**
 * How many times a Points3D sphere's icosahedron is subdivided by default (TODO 69.17): 3 is 320
 * triangles, an outline within about 1% of the radius. 1 (80 triangles) looked polygonal at the
 * default size; 100,000 lit spheres draw in 14 ms a frame at 3 against 4 ms at 1 and 21 ms at 4
 * (docs/PERFORMANCE.md), so a larger dataset can ask for less.
 */
export const SPHERE_DETAIL = 3;

// Presentation and safe geometry defaults are specific to the concrete mark.
export function configureMarkOptions(node, kind) {
  const threeD = kind === "scatter3d";
  if (!["scatter3d", "scatter2d", "sprite", "heatmap"].includes(kind)) return;
  const shape = new SelectType({
    label: "Shape",
    options: threeD
      ? ["sphere", "cube"]
      : kind === "heatmap"
        ? ["circle", "square"]
        : shapeNames(),
  });
  node.presentationTypes.set("shape", { ...shape.ui(), type: shape });
  if (kind === "heatmap" && node.get("shape") === "circle")
    node.set("shape", "square");
  const detail = new IntegerType({
    label: "Detail",
    min: threeD ? 0 : 3,
    max: threeD ? 4 : kind === "heatmap" ? 2048 : 100,
    step: 1,
  });
  node.presentationTypes.set("detail", { ...detail.ui(), type: detail });
  // Each mark's own slider, whichever mark defined the shared option first (TODO 32.3).
  if (kind !== "heatmap") node.presentationTypes.set("outlineWidth", { ...POINT_OUTLINE.ui(), type: POINT_OUTLINE });
  // Kind defaults, not settings: a shape or detail the mark is given, or one set on the plot above
  // it, wins, and a reset returns to these.
  if (threeD) {
    node.setKindDefault("shape", "sphere");
    node.setKindDefault("detail", SPHERE_DETAIL);
  }
  // A literal or unscaled Points size is the point's diameter in CSS pixels, as a mapped size's
  // sizeRange is (TODO 73.1): the sprite spans one size unit, so its unit range is [0, 1]. The
  // shared default, [0, 0.5], keeps Points3D's size its sphere's diameter in world units.
  if (kind === "sprite") node.setKindDefault("scaleRange", [0, 1]);
}
