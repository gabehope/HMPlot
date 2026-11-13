// @ts-check
// The mark kinds theme.marks accepts (python/hmplot/data.py reads the same list from the
// generated registry): the primitives, and the built-in templates' theme kinds (TODO 130.2;
// every compound mark is a template since 130.3).
import { TEMPLATES } from "../../templates/builtins.js";

const PRIMITIVE_KINDS = [
  "Area", "Arrows3D", "GeoJSON", "Heatmap", "Image", "Text", "Line",
  "Prism", "Rect", "Points3D", "Points", "Segments", "Surface", "Text3D", "Polygon",
];

/** Mark kinds theme.marks accepts. */
export const MARK_KINDS = new Set([
  ...PRIMITIVE_KINDS,
  ...TEMPLATES.flatMap((definition) => (definition.theme ? [definition.theme.kind] : [])),
]);
