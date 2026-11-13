/**
 * The internal surface compound marks are built from (Histogram, Violin, BoxPlot, Bar,
 * Swarm, Lollipop, Pie). Exported to authors only as `composition` from `hmplot/compound`.
 * @experimental Names and behavior may change between minor releases.
 */
export { default as Transform } from "./transform.svelte";
export { default as DataBoundary } from "./dataBoundary.svelte";
export { default as ThemeDefaults } from "./themeDefaults.svelte";
export { default as Undescribed } from "./undescribed.svelte";
export { getOptionsContext, setOptionsContext } from "./utils/context.js";
export { DATA_CONTEXT, axisCategory } from "./utils/categorical.js";
export { categoryColumn, categoryField } from "./utils/dataView.js";
export { IntegerType, SelectType, FieldType } from "./objects/types.js";
// Expression builders a compound mark needs to derive a channel (a hand-written lollipop sorts its stem ends),
// and the animate() test, so a mark can unwrap a descriptor for a part it derives.
export { minimum, maximum, greater } from "./utils/expressions.js";
export { isAnimate } from "./utils/animation.js";
// Connections: a compound mark registers its primitive as its endpoint (ENDPOINT_COMPOUND_CONTEXT)
// and exports endpoint({at}) built with endpointDescriptor.
export { ENDPOINT_COMPOUND_CONTEXT, endpointDescriptor } from "./utils/connections.js";
// Axis titles (TODO 21): a compound mark plots internal columns, so it provides the votes of its
// user's channels (AXIS_NAMES_CONTEXT, a function returning {x, y, z}), each from channelTitle
// against the compound's outer data scope: a column name, undefined (abstain) or null (unnamed).
export { AXIS_NAMES_CONTEXT, channelTitle } from "./utils/axisTitles.js";
// A Mapping's layers, which a template wrapper reads where its parts can't (ErrorBars' positions).
export { MAPPING_CONTEXT } from "./utils/mapping.js";
// Data-bound marks: they resolve column names against the enclosing Data scope (ErrorBars is a
// template over Segments, TODO 130.3).
export { default as Rect } from "./bound/rect.svelte";
export { default as Area } from "./bound/area.svelte";
export { default as Points } from "./bound/scatterPoints.svelte";
export { default as Anchor } from "./bound/anchor.svelte";
export { default as Prism } from "./bound/prism.svelte";
export { default as ErrorBars } from "../compound/errorBars.svelte";
export { default as Segments } from "./bound/segments.svelte";
export { default as Line } from "./bound/line.svelte";
export { default as Text } from "./bound/label.svelte";
// A Frame of the compound's own (a Pie in a Cartesian frame places a polar one), and the view it
// draws in: VIEW_CONTEXT's width() and height() (CSS pixels) and frame() (the visible world box).
export { default as Frame } from "./frame.svelte";
export { VIEW_CONTEXT } from "./utils/axisFrame.js";
// Public transforms compound marks wrap.
export { default as Density } from "./density.svelte";
export { default as Regression } from "./regression.svelte";
export { default as Contour } from "./contour.svelte";
export { default as Filter } from "./filter.svelte";
// Filled polygons, a core primitive (TODO 130.1): DensityBands draws its bands with it.
export { default as Polygon } from "./bound/polygon.svelte";
export { default as Dodge } from "./dodge.svelte";
// A compound's own axis rule for its Dodge (Swarm's), read with the data as it lays out.
export { DODGE_AXIS_CONTEXT } from "./utils/dodgeLayout.js";
// Pointer marks (TODO 45): a rule refused where x = c is a plane (a 3D Cartesian view), naming its
// kind (RuleX, RuleY, Crosshair), and the pointer in the enclosing frame with its readouts.
export { planeRule } from "./utils/planeRule.svelte.js";
export { framePointer } from "./utils/framePointer.svelte.js";
// Inputs (TODO 41): a compound mark resolves input reads in the props it reads itself.
export { INPUT_CONTEXT, InputPending, resolveInput } from "./utils/inputs.js";
