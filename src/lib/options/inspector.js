import { viewMode } from "../plot/utils/camera.js";
import { positionalOption } from "../plot/utils/axisFrame.js";
import { writable, readable, get } from "svelte/store";
/** @typedef {{node: import("./options.js").OptionsNode, label: string,
 * rootFrame: () => import("./options.js").OptionsNode,
 * renderer?: import("../plot/utils/internalTypes.js").PlotRenderer,
 * update(value?: unknown): void, dispose(): void}} PlotRegistration */
/** @type {import("svelte/store").Writable<PlotRegistration[]>} */
export const mountedPlots = writable([]);
let nextPlot = 0;

/**
 * Register a Plot's options with the settings pane. `rootFrame` returns the options of the frame
 * its marks draw in (a promoted Frame, else the Plot's own): its Coordinates rows edit those.
 */
export function registerPlot(node, name, { rootFrame = () => node } = {}) {
  const fallback = `Plot ${++nextPlot}`;
  /** @type {PlotRegistration} */
  const entry = { node, label: "", rootFrame, update, dispose };
  function update(value) {
    const base = String(value ?? "").trim() || fallback;
    const used = new Set(
      get(mountedPlots)
        .filter((p) => p !== entry)
        .map((p) => p.label),
    );
    let label = base,
      suffix = 2;
    while (used.has(label)) label = `${base} (${suffix++})`;
    entry.label = label;
    node.setPresentation({ kind: "plot", label });
    mountedPlots.update((plots) => [...plots]);
  }
  function dispose() {
    mountedPlots.update((plots) => plots.filter((p) => p !== entry));
  }
  update(name);
  mountedPlots.update((plots) => [...plots, entry]);
  return entry;
}
// The registration of the Plot whose options `node` are, if any. A Plot's options are its root
// frame's (Stage 119.2), so a registered Plot has an Axes scope.
const registeredPlot = (node) =>
  get(mountedPlots).find((entry) => entry.node === node);

// Only topology/presentation changes rebuild the inspector. Values have their
// own subscriptions; editing a slider must not reconnect the whole tree.
export function treeStore(root) {
  return readable(0, (set) => {
    let revision = 0,
      stops = [],
      pending = false,
      disposed = false;
    function connect() {
      stops.forEach((stop) => stop());
      stops = [];
      const seen = new Set();
      function visit(node) {
        if (!node || seen.has(node)) return;
        seen.add(node);
        stops.push(node.onStructure(refresh));
        node.children.forEach(visit);
        node.dependents.forEach(visit);
        visit(node.viewOptions);
      }
      visit(root);
    }
    function refresh() {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        if (disposed) return;
        pending = false;
        connect();
        set(++revision);
      });
    }
    connect();
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
    };
  });
}

function scopeLabel(node) {
  return node.presentation.label || node.identifier;
}
export function scopes(root) {
  const view = {
    id: `${root.uid}:view`,
    node: root,
    kind: "view",
    label: root.presentation.kind === "facet" ? "Facet" : "Plot",
    depth: 0,
    parent: null,
  };
  view.breadcrumb = [view.label];
  const defaults = {
    id: root.uid,
    node: root,
    kind: "defaults",
    label: "Mark defaults",
    depth: 1,
    parent: view.id,
    breadcrumb: [view.label, "Mark defaults"],
  };
  const result = [view];
  if (registeredPlot(root))
    result.push({
      id: root.uid + ":axis",
      node: root,
      kind: "axis",
      label: "Axes",
      depth: 1,
      parent: view.id,
      breadcrumb: [view.label, "Axes"],
    });
  result.push(defaults);
  function visit(node, parent) {
    for (const child of node.dependents.values()) {
      // presentation.hidden: a scope that is part of another component (a VectorTile's slots).
      if (child.isDisposed || child.presentation.hidden) continue;
      const kind = child.presentation.kind || "group";
      // Data and transform scopes carry columns, not coordinate ownership.
      // Explicit frames always belong to their Plot in the inspector,
      // even when their source markup passes through one of those scopes.
      const container = kind === "axis" ? view : parent;
      const overrides = [...child.values.keys()].filter(positionalOption);
      const label = scopeLabel(child) + (kind === "group" ? " defaults" : "");
      const item = {
        id: child.uid,
        node: child,
        kind,
        type: child.presentation.type,
        customCoordinates: kind === "mark" && overrides.length > 0,
        label,
        depth: container.depth + 1,
        parent: container.id,
        breadcrumb: [...container.breadcrumb, label],
      };
      result.push(item);
      visit(child, item);
    }
  }
  visit(root, view);
  return result;
}

function coordinateAxisNames(scope) {
  if (scope.get?.("coordinates") === "polar")
    return { x: "Angle", y: "Radius", z: "Height" };
  if (
    scope.get?.("coordinates") === "spherical" &&
    scope.get?.("projection") === "orthographic"
  )
    return { x: "Angle", y: "Latitude", z: "Radius" };
  return null;
}

/** The axis pane's dimension groups named for the coordinates: X is Angle in polar ones. */
function nameDimensions(rows, scope) {
  const names = coordinateAxisNames(scope);
  if (names)
    for (const row of rows)
      row.group =
        { X: names.x, Y: names.y, Z: names.z }[row.group] ?? row.group;
  return rows;
}
export function survivingTarget(selected, previous, current) {
  const available = new Set(current.map((t) => t.id));
  while (selected && !available.has(selected))
    selected = previous.find((t) => t.id === selected)?.parent;
  return selected || current[0]?.id;
}

const metadata = {};
// Axis label rows (TODO 21): an empty label is automatic.
const AXIS_LABEL_HELP =
  "Empty: named after the column this axis's marks plot, when they plot one. Reset returns to automatic.";
function group(section, title, entries) {
  entries.forEach(([path, label, extra = {}], order) => {
    if (metadata[path])
      throw Error(`Inspector setting ${path} is declared twice.`);
    metadata[path] = { section, group: title, label, order, ...extra };
  });
}
// The axis editor (optionRows with axis: true; Stage 114.1): one descriptor per axis setting,
// in its group's display order. A dimension's rows group under X, Y and Z, which the axis pane
// names for the coordinates (nameDimensions). Scale rows describe automatic mappings and show
// in the axis pane only (axisPane).
const AXIS_PATHS = [];
function axisGroup(title, entries) {
  group("Axis", title, entries);
  AXIS_PATHS.push(...entries.map(([path]) => path));
}
axisGroup("Frame", [
  ["plot.axes2d", "Show 2D axes"],
  ["plot.axes3d", "3D guides"],
  ["plot.axisFrame", "Full rectangular border"],
  ["plot.axisMask", "Clip data to axes"],
  ["plot.referenceRules", "Reference lines"],
  ["plot.referenceBands", "Bands"],
]);
const DIMENSION_SETTINGS = [
  ["Type", "Coordinate type"],
  ["Format", "Tick format"],
  ["Timezone", "Timezone"],
  ["TimeOrigin", "Time origin (Unix ms)"],
  ["Major", "Major ticks"],
  ["Step", "Major step (0 = automatic)"],
  ["MajorInterval", "Major calendar interval"],
  ["Minor", "Minor ticks"],
  ["Subdivisions", "Minor subdivisions"],
  ["MinorInterval", "Minor calendar interval"],
  ["Grid", "Grid rules"],
];
for (const axis of ["x", "y", "z"]) {
  const cap = axis.toUpperCase();
  axisGroup(cap, [
    [`${axis}Transform`, "Scale transform"],
    [`${axis}bounds`, "Domain"],
    [`${axis}range`, "Output range"],
    [`plot.axisLabel${cap}`, "Label", { help: AXIS_LABEL_HELP }],
    ...DIMENSION_SETTINGS.map(([key, label]) => [
      `plot.axis${cap}${key}`,
      label,
    ]),
    [`plot.frame${cap}Show`, "Show axis"],
    ...(axis === "z" ? [] : [[`plot.frame${cap}Side`, "Placement"]]),
  ]);
}
axisGroup("Appearance", [
  ["plot.axisFontSize", "Font size"],
  ["plot.axisLineWidth", "Line thickness"],
  ["plot.axisTickSize", "Tick length"],
  ["plot.axisMarginLeft", "Left margin"],
  ["plot.axisMarginRight", "Right margin"],
  ["plot.axisMarginTop", "Top margin"],
  ["plot.axisMarginBottom", "Bottom margin"],
  ["plot.axisTickLabels", "Show tick labels"],
  ["plot.axisTitles", "Show axis titles"],
]);
const SCALE_LABELS = {
  Domain: "Source domain (min, max or auto)",
  Transform: "Normalization transform",
  DomainSource: "Infer domain from",
  Colormap: "Colormap",
  Quantize: "Quantize colors",
  Levels: "Color levels",
  Range: "Output range",
};
for (const [scale, keys] of [
  [
    "Color",
    ["Domain", "Transform", "DomainSource", "Colormap", "Quantize", "Levels"],
  ],
  ["Size", ["Domain", "Transform", "DomainSource", "Range"]],
  ["Width", ["Domain", "Transform", "DomainSource", "Range"]],
])
  axisGroup(
    `${scale} scale`,
    keys.map((key) => [
      `scale${scale}${key}`,
      SCALE_LABELS[key],
      {
        axisPane: true,
        help: "Applies to automatic mappings of named numeric columns. An explicit scale resource controls its own mapping.",
      },
    ]),
  );
group("Axis", "Scale animation", [
  ["animateBounds", "Animate bounds"],
  ["boundsDuration", "Duration (ms)"],
  ["boundsEasing", "Easing"],
]);
group("Plot", "Legends", [
  ["plot.legendEnabled", "Series legend"],
  ["plot.legendPosition", "Legend position"],
]);
group("Facet", "Appearance scales", [
  ["facetColorResolution", "Color domains"],
  ["facetSizeResolution", "Size domains"],
  ["facetWidthResolution", "Width domains"],
  ["facetShapeResolution", "Shape categories"],
]);
group("Marks", "Legend", [
  ["label", "Legend label"],
  ["legend", "Include in automatic legend"],
  ["visible", "Visible"],
  ["legendFontSize", "Guide font size"],
  ["legendTextColor", "Guide text color"],
  ["legendTickFormat", "Colorbar tick format"],
]);
group("Marks", "Categories", [
  ["categoryFill", "Fill categories"],
  ["categoryStroke", "Color categories"],
  ["categoryShape", "Symbol categories"],
  ["categoryOutlineColor", "Outline categories"],
  ["categorySize", "Size categories"],
  ["categoryWidth", "Width categories"],
  ["categoryOpacity", "Opacity categories"],
]);
group("Marks", "Caps", [["capSize", "Cap size (pixels)"]]);
group("Plot", "View", [
  ["type", "View mode"],
  [
    "plot.cameraMode",
    "3D camera",
    {
      dependency: "3d",
      help: "Flyover: drag moves the ground under the cursor, the wheel zooms toward the cursor (scroll down = away), right-drag or Alt-drag looks, W/A/S/D travel, Q/E change height, Shift for x3 on wheel and keys; on touch, two fingers pinch toward their midpoint.",
    },
  ],
  [
    "plot.cameraFov",
    "3D field of view",
    { dependency: "3d", help: "Vertical field of view in degrees." },
  ],
  [
    "plot.cameraNear",
    "3D near clip",
    { dependency: "3d", help: "Empty derives it from the scene size." },
  ],
  [
    "plot.cameraFar",
    "3D far clip",
    { dependency: "3d", help: "Empty derives it from the scene size." },
  ],
  [
    "plot.fog",
    "3D fog",
    {
      dependency: "3d",
      help: "Distance fog: the scene fades toward the fog color from the start to the end distance, in world units from the camera.",
    },
  ],
  [
    "plot.lights",
    "Lights",
    { help: "Lights used by lit marks. Positions use world coordinates." },
  ],
  ["plot._fogNear", "Fog start", { dependency: "3d" }],
  ["plot._fogFar", "Fog end", { dependency: "3d" }],
  [
    "plot._fogColor",
    "Fog color",
    {
      dependency: "3d",
      help: "A CSS color. Empty uses the plot's background.",
    },
  ],
]);
group("Plot", "Coordinates", [
  ["coordinates", "Coordinates"],
  ["angleUnit", "Angle units"],
  ["anglePeriod", "Units per rotation", { dependency: "custom-angle" }],
  ["projection", "Projection"],
  ["sphericalView", "Spherical 3D view"],
  ["baseRadius", "Base radius"],
  ["radialScale", "Radial scale"],
  ["interpolation", "Path interpolation"],
  ["subdivisionTolerance", "Subdivision error (pixels)"],
]);
group("Marks", "Display", [
  ["displayScale", "Display scale"],
  ["maxInstances", "Instance limit"],
]);
group("Plot", "Zoom", [
  ["scene2d.zoomAxis", "Zoom"],
  ["scene2d.axisMarginZoom", "Zoom axes independently in margins"],
  ["plot.dynamicMargins", "Fit margins during navigation"],
]);
group("Plot", "Rendering", [
  ["plot.background", "Background"],
  ["plot.antialias", "Antialiasing"],
  [
    "plot._bloomStrength",
    "Bloom strength",
    {
      help: "How bright the bloom of glowing marks is (the Plot's bloom effect's strength).",
    },
  ],
  [
    "plot._bloomRadius",
    "Bloom radius",
    {
      help: "How far the bloom of glowing marks spreads, from 0 to 1 (the bloom effect's radius).",
    },
  ],

  [
    "plot.aspect",
    "Aspect ratio",
    {
      dependency: "2d",
      help: "Preserve proportions keeps one data unit the same length on x and y; Fill plot stretches to the available width and height.",
    },
  ],
]);
group("Plot", "Overview", [
  ["plot.overview", "Show overview"],
  ["plot.overviewAxes", "Overview axes"],
  ["plot.overviewScale", "Display scale"],
  ["plot.overviewMaxInstances", "Instance limit"],
]);
group("Marks", "Paths", [
  ["curve", "Curve"],
  ["curveAlpha", "Catmull–Rom alpha"],
]);
group("Marks", "Labels", [
  ["dx", "Horizontal offset (pixels)"],
  ["dy", "Vertical offset (pixels)"],
]);
group("Plot", "Navigation", [
  [
    "scene2d.clamp",
    "Constrain 2D panning",
    { dependency: "2d", help: "Available in 2D view." },
  ],
  [
    "plot.flySpeed",
    "Fly speed",
    {
      dependency: "flyover",
      help: "Multiplies flyover wheel zoom and key travel (the drag follows the cursor, so it has no rate). Hold Shift for x3.",
    },
  ],
  [
    "plot.flyoverMomentum",
    "Flyover momentum",
    {
      dependency: "flyover",
      help: "A ground drag released while moving glides on briefly, slowing to a stop. Off: the view stops on release. Reduced motion turns it off.",
    },
  ],
]);
group("Plot", "Axes", [
  [
    "plot.orientation3d",
    "Show 3D orientation",
    { dependency: "3d", help: "Appears on hover in 3D view." },
  ],
]);
group("Appearance", "Color mapping", [
  ["cmapIndex", "Colormap"],
  ["quantize", "Quantized colors"],
  [
    "levels",
    "Levels",
    {
      dependency: "levels",
      help: "Used by quantized colors and contour spacing.",
    },
  ],
  ["valueTransform", "Value transform"],
  ["valueBounds", "Data bounds"],
  ["valueRange", "Output range"],
]);
group("Appearance", "Color and opacity", [
  ["fillColor", "Color"],
  ["labelColor", "Text color"],
  ["opacity", "Opacity"],
  [
    "glow",
    "Glow",
    {
      help: "How much the mark glows: its color times glow blooms around it; 0 does not glow.",
    },
  ],
  ["transparent", "Transparency"],
  ["lit", "Lighting"],
  ["depthtest", "Depth testing"],
  ["depthWrite", "Write depth"],
]);
group("Appearance", "Outline", [
  ["outlineColor", "Color"],
  [
    "outlineWidth",
    "Width",
    {
      help: "Inside border width in CSS pixels. Zero hides the border.",
    },
  ],
  [
    "outlineOpacity",
    "Opacity",
    {
      help: "Fade the border over its fill, from 0 to 1. Mark opacity applies to both.",
    },
  ],
]);
group("Appearance", "Grid", [
  ["grid.enabled", "Show grid"],
  ["grid.polar", "Polar coordinates"],
  ["grid.cells", "Cell count"],
  ["grid.offset", "Offset"],
  ["grid.cellsWidth", "Cell line width"],
  ["grid.cellColor", "Cell color"],
  ["grid.sections", "Section count"],
  ["grid.sectionsWidth", "Section line width"],
  ["grid.sectionColor", "Section color"],
  ["grid.strength", "Strength"],
]);
group("Appearance", "Contours", [
  ["contour.enabled", "Show contours"],
  ["contour.width", "Line width"],
  ["contour.feather", "Feather"],
  ["contour.color", "Contour color"],
  ["contour.strength", "Strength"],
]);
for (const [path, spec] of Object.entries(metadata)) {
  if (path.startsWith("grid.") && path !== "grid.enabled")
    Object.assign(spec, {
      dependency: "grid",
      help: "Enable Grid to adjust these settings.",
    });
  if (path.startsWith("contour.") && path !== "contour.enabled")
    Object.assign(spec, {
      dependency: "contour",
      help: "Enable Contours to adjust these settings.",
    });
}
group("Geometry", "Surface", [
  [
    "zScale",
    "Height scale",
    {
      help: "Surface height in Z units (radial offset for spherical plots). Zero disables relief. Legacy flat heatmaps retain their peak height.",
    },
  ],
]);
group("Geometry", "Shape", [
  ["shape", "Shape"],
  ["rotation", "Rotation (degrees)"],
  ["detail", "Detail"],
]);
group("Geometry", "Size", [
  ["fontSize", "Font size"],
  ["sizeAttenuation", "Perspective size"],
  ["scaleTransform", "Size transform"],
  ["scaleBounds", "Data bounds"],
  ["scaleRange", "Output range"],
]);
group("Geometry", "Width", [
  ["widthTransform", "Width transform"],
  ["widthBounds", "Data bounds"],
  ["widthRange", "Output range"],
]);
group("Geometry", "Dashes", [
  ["dashed", "Dashed line"],
  [
    "dashSize",
    "Dash length",
    { dependency: "dashes", help: "Enable Dashed line to adjust the pattern." },
  ],
  [
    "gapSize",
    "Gap length",
    { dependency: "dashes", help: "Enable Dashed line to adjust the pattern." },
  ],
]);
group("Geometry", "Curves and arrows", [
  ["subdivisions", "Subdivisions"],
  ["headLength", "Head length"],
  ["headWidth", "Head width"],
]);
group("Geometry", "Text layout", [
  ["font", "Font"],
  ["align", "Alignment"],
  ["billboard", "Face camera"],
]);
group("Advanced", "Capacity", [["maxElements", "Maximum elements"]]);

export function optionRows(
  scope,
  prefix = "",
  { view = false, shared = false, axis = false } = {},
) {
  const rows = [];
  function visit(node, pathPrefix = "", only) {
    const list = only ??
      node.displayList ?? [
        ...node.keys,
        ...new Set([
          ...node.children.keys(),
          ...(node.defaults ? childNames(node.defaults) : []),
        ]),
      ];
    const added = new Set();
    for (const raw of list) {
      const entry = raw.replaceAll("-", ".");
      if (added.has(entry)) continue;
      added.add(entry);
      if (entry.includes(".")) {
        const [child, ...rest] = entry.split(".");
        if (node.hasChild(child))
          visit(node.child(child), `${pathPrefix}${child}.`, [rest.join(".")]);
      } else if (node.has(entry)) {
        if (
          !axis &&
          !shared &&
          (positionalOption(entry) || entry.startsWith("frame"))
        )
          continue;
        const spec = node.getType(entry);
        if (!spec?.ui) continue;
        const path = pathPrefix + entry;
        const described = metadata[path];
        const meta =
          described && (axis || !described.axisPane)
            ? described
            : {
                section: "Advanced",
                group: "Other settings",
                label: spec.label || entry,
              };
        rows.push({
          ...meta,
          node,
          scope,
          key: entry,
          path,
          id: `${node.uid}:${entry}`,
          spec,
          explicitOrder: node.displayList !== undefined || only !== undefined,
        });
      } else if (
        node.hasChild(entry) &&
        !["plot", "scene2d", "scene3d"].includes(entry)
      )
        visit(node.child(entry), `${pathPrefix}${entry}.`);
    }
  }
  if (axis) {
    // A Plot's own frame shows its 2D and 3D axis switches; a Frame's does not.
    const plotFrame = !!registeredPlot(scope);
    const own = (key) => plotFrame || (key !== "axes2d" && key !== "axes3d");
    visit(
      scope,
      "",
      AXIS_PATHS.filter((path) => !path.startsWith("plot.")),
    );
    if (scope.hasChild("plot"))
      visit(
        scope.child("plot"),
        "plot.",
        AXIS_PATHS.filter((path) => path.startsWith("plot."))
          .map((path) => path.slice(5))
          .filter(own),
      );
    return nameDimensions(rows, scope);
  }
  if (view && scope.presentation.kind === "facet")
    visit(scope, "", [
      "facetRow",
      "facetColumn",
      "facetWrap",
      "facetRowOrder",
      "facetColumnOrder",
      "facetGap",
      "facetScales",
      "facetLink",
      "facetColorResolution",
      "facetSizeResolution",
      "facetWidthResolution",
      "facetShapeResolution",
    ]);
  if (view || shared) {
    // The coordinate system the Plot draws in: a Frame that wraps all of its marks is its root
    // (registerPlot's rootFrame), so the Plot's Coordinates rows show and edit that Frame's
    // options, not the Plot's own defaults (a polar root Frame read "cartesian" here).
    visit((view && registeredPlot(scope)?.rootFrame()) || scope, "", [
      "coordinates",
      "angleUnit",
      "anglePeriod",
      "projection",
      "sphericalView",
      "baseRadius",
      "radialScale",
      "interpolation",
      "subdivisionTolerance",
    ]);
    if (view && scope.viewOptions) visit(scope.viewOptions, "", ["type"]);
    if (scope.hasChild("plot"))
      visit(scope.child("plot"), "plot.", [
        "antialias",
        "orientation3d",
        "overview",
        "legendEnabled",
        "legendPosition",
        "overviewScale",
        "overviewAxes",
        "aspect",
        "dynamicMargins",
        "animation",
        "animationDuration",
        "animationEasing",
        "animateBounds",
        "boundsDuration",
        "boundsEasing",
        "overviewMaxInstances",
        "cameraMode",
        "cameraFov",
        "cameraNear",
        "cameraFar",
        "flySpeed",
        "flyoverMomentum",
        "lights",
        "fog",
        "_fogNear",
        "_fogFar",
        "_fogColor",
        "_bloomStrength",
        "_bloomRadius",
      ]);
    if (scope.hasChild("scene2d"))
      visit(scope.child("scene2d"), "scene2d.", [
        "clamp",
        "zoomAxis",
        "axisMarginZoom",
      ]);
  }
  if (!view) visit(scope, prefix);
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
function childNames(node) {
  return [
    ...new Set([
      ...node.children.keys(),
      ...(node.defaults ? childNames(node.defaults) : []),
    ]),
  ];
}
export function groupedRows(rows, search = "") {
  const query = search.trim().toLowerCase();
  const groups = new Map();
  for (const row of rows) {
    if (
      query &&
      !`${row.label} ${row.path} ${row.section} ${row.group} ${row.help ?? ""}`
        .toLowerCase()
        .includes(query)
    )
      continue;
    const id = `${row.section}/${row.group}`;
    if (!groups.has(id))
      groups.set(id, { id, section: row.section, label: row.group, rows: [] });
    groups.get(id).rows.push(row);
  }
  const sectionOrder = [
    "Plot",
    "Axis",
    "Axes",
    "Marks",
    "Appearance",
    "Geometry",
    "Advanced",
  ];
  const result = [...groups.values()].sort((a, b) => {
    const sections =
      sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
    if (sections) return sections;
    if (a.section === "Axis") {
      const order = [
        "Frame",
        "X",
        "Y",
        "Z",
        "Angle",
        "Latitude",
        "Radius",
        "Height",
        "Appearance",
      ];
      return order.indexOf(a.label) - order.indexOf(b.label);
    }
    return 0;
  });
  for (const group of result)
    if (!group.rows.some((row) => row.explicitOrder))
      group.rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return result;
}
export function hasOverride(node, key) {
  return !!node.defaults && node.values.has(key);
}
function sourceLabel(node) {
  while (node?.parent) node = node.parent;
  if (!node?.defaults) return "Shared defaults";
  return node.presentation.kind === "plot"
    ? `${scopeLabel(node)} · Mark defaults`
    : scopeLabel(node) + (node.presentation.kind === "mark" ? "" : " defaults");
}
function candidates(scope) {
  const result = [scope];
  for (const child of scope.dependents.values())
    result.push(...candidates(child));
  return result;
}
function inherits(candidate, row) {
  let target = candidate;
  const parts = row.path.split(".");
  for (const part of parts.slice(0, -1)) {
    if (!target.hasChild(part)) return false;
    target = target.child(part);
  }
  while (target && target !== row.node) {
    if (target.values.has(row.key)) return false;
    target = target.defaults;
  }
  return target === row.node;
}
export function rowState(row) {
  return readable({}, (set) => {
    const targets = candidates(row.scope);
    const dependencies =
      row.dependency === "axes2d"
        ? ["plot-axes2d"]
        : row.dependency === "levels"
          ? ["quantize", "contour-enabled"]
          : row.dependency === "grid"
            ? ["grid-enabled"]
            : row.dependency === "contour"
              ? ["contour-enabled"]
              : row.dependency === "dashes"
                ? ["dashed"]
                : row.dependency === "custom-angle"
                  ? ["angleUnit"]
                  : [];
    function refresh() {
      let enabled = true;
      if (["2d", "3d"].includes(row.dependency))
        enabled = targets.some(
          (target) =>
            target.viewOptions &&
            viewMode(target.viewOptions.get("type")) === row.dependency,
        );
      else if (row.dependency === "flyover")
        enabled = targets.some(
          (target) =>
            viewMode(target.viewOptions?.get("type")) === "3d" &&
            target.get("plot.cameraMode") === "flyover",
        );
      else if (row.dependency === "custom-angle")
        enabled = targets.some(
          (target) =>
            inherits(target, row) && target.get("angleUnit") === "custom",
        );
      else if (row.dependency === "axes2d")
        enabled = targets.some(
          (target) =>
            inherits(target, row) &&
            target.viewOptions?.get("type") === "2d" &&
            target.get("plot-axes2d"),
        );
      else if (dependencies.length)
        enabled = targets.some(
          (target) =>
            inherits(target, row) &&
            dependencies.some((key) => target.has(key) && target.get(key)),
        );
      const overridden = hasOverride(row.node, row.key);
      set({
        disabled: !enabled,
        hidden: row.dependency === "custom-angle" && !enabled,
        overridden,
        source: sourceLabel(row.node.owner(row.key)),
        canReset: !!row.node.defaults,
      });
    }
    const stops = [row.node.on(refresh, row.key)];
    for (const target of targets) {
      if (target.has(row.path)) stops.push(target.on(refresh, row.path));
      for (const key of dependencies)
        if (target.has(key)) stops.push(target.on(refresh, key));
    }
    if (["2d", "3d", "axes2d", "flyover"].includes(row.dependency))
      for (const target of targets)
        if (target.viewOptions)
          stops.push(target.viewOptions.on(refresh, "type"));
    if (row.dependency === "flyover")
      for (const target of targets)
        if (target.has("plot.cameraMode"))
          stops.push(target.on(refresh, "plot.cameraMode"));
    refresh();
    return () => stops.forEach((stop) => stop());
  });
}

export function validateNumber(raw, spec) {
  // A setting that is measured unless pinned (axisMargin*, TODO 136.10): empty or "auto".
  if (spec.auto && ["", "auto"].includes(String(raw).trim().toLowerCase()))
    return { value: "auto" };
  if (String(raw).trim() === "")
    return {
      error: spec.auto ? 'Enter a number or "auto".' : "Enter a number.",
    };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { error: "Enter a finite number." };
  if (
    (spec.integer || spec.type?.uniformType === "int") &&
    !Number.isInteger(value)
  )
    return { error: "Enter a whole number." };
  if (spec.min != null && value < spec.min)
    return { error: `Minimum: ${spec.min}.` };
  if (spec.max != null && value > spec.max)
    return { error: `Maximum: ${spec.max}.` };
  return { value };
}

group("Marks", "Animation", [
  ["animation", "Animated updates"],
  ["animationDuration", "Duration (ms)"],
  ["animationEasing", "Easing"],
]);

group("Marks", "Geography", [
  ["heightBounds", "Height input bounds"],
  ["heightRange", "Height output range"],
  ["missingColor", "Missing values"],
  [
    "zoomBias",
    "Tile detail",
    {
      help: "Offset live tile zoom at the same camera height or view scale. +1 doubles linear detail, -1 coarsens it; zoom limits and the tile budget still apply.",
    },
  ],
  [
    "extrudeBuildings",
    "3D buildings",
    {
      help: "A VectorTile under a 3D flyover camera: stand the tiles' buildings up from their heights (off: flat footprints). 2D maps are always flat.",
    },
  ],
]);

group("Facet", "Layout", [
  ["facetRow", "Rows"],
  ["facetColumn", "Columns"],
  ["facetWrap", "Wrap (0 = automatic)"],
  ["facetGap", "Gap"],
  ["facetRowOrder", "Row order"],
  ["facetColumnOrder", "Column order"],
]);
group("Facet", "Scales and navigation", [
  [
    "facetScales",
    "Domains",
    {
      help: "shared: one domain per axis. field: cells share the domain of the column they plot (one per field with fields or pairs, the default there); table columns stay shared. free: per cell. Reset returns to shared.",
    },
  ],
  ["facetLink", "Linked navigation"],
]);
group("Histogram", "Binning", [
  ["histogramBins", "Bins / edges"],
  ["histogramNormalization", "Normalization"],
]);
