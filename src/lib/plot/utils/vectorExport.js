/** Internal facade: capture borrowed mark data once, then write 2D or 3D vectors. */
export { colormapPosition, exportColors } from "./vectorExport/capture.js";
export { orthographicPolyline, chainedOutline, chainPolyline, symbolPath } from "./vectorExport/geometry.js";
export { vectorCandidate, vectorMark } from "./vectorExport/twoDimensional.js";
export { isView3D, view3DIssue, view3DKind, viewCamera, clipDepth, clipPolygonDepth, depthRuns, orderPrimitives, view3DElements, view3DVectors } from "./vectorExport/threeDimensional.js";
