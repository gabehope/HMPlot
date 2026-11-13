// Component manifests belong to bundled plugins; the core only consumes generated artifacts.
import geometry from "./geometry.manifest.js";
import contour from "./contour.manifest.js";
import density from "./density.manifest.js";
import regression from "./regression.manifest.js";
export const COMPONENT_MANIFESTS = [
  ...geometry,
  ...contour,
  ...density,
  ...regression,
];
