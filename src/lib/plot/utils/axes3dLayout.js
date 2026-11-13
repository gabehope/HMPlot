/** Validate and resolve 3D guides independently from camera/rendering state. */
export function resolveAxes3d(config, defaults = {}, coordinates = "cartesian") {
  if (config === false || config == null) return null;
  if (typeof config !== "boolean" && (!config || typeof config !== "object" || Array.isArray(config)))
    throw Error('Plot axes3d requires true, false, or {style: "box" | "triad", gridPlanes: ["xy", "xz", "yz"]}.');
  if (typeof config === "object" && coordinates !== "cartesian")
    throw Error('Plot axes3d box/triad guides require Cartesian coordinates; pass axes3d=false for polar or spherical plots.');
  if (coordinates !== "cartesian") return null;
  const merged = { style: "box", gridPlanes: [], ...defaults,
    ...(typeof config === "object" ? config : {}) };
  if (!['box', 'triad'].includes(merged.style))
    throw Error('Plot axes3d.style requires "box" or "triad".');
  if (!Array.isArray(merged.gridPlanes) || merged.gridPlanes.some(plane => !["xy", "xz", "yz"].includes(plane)))
    throw Error('Plot axes3d.gridPlanes requires an array containing "xy", "xz", or "yz".');
  if (typeof config === "object" && Object.keys(config).some(key => !["style", "gridPlanes"].includes(key)))
    throw Error('Plot axes3d accepts only style and gridPlanes.');
  return { style: merged.style, gridPlanes: [...new Set(merged.gridPlanes)] };
}

/** Keep the previous face near a camera-plane tie to avoid flickering labels. */
export function nearFaces(ranges, camera, previous = [0, 0, 0]) {
  return ranges.map((range, axis) => {
    const center = (range[0] + range[1]) / 2, delta = camera[axis] - center;
    return Math.abs(delta) <= Math.abs(range[1] - range[0]) * .01
      ? previous[axis] : Number(delta > 0);
  });
}

/** World-space box/triad geometry shared by screen and exported guides. */
export function axes3dGeometry(ranges, layouts, { style = "box", gridPlanes = [] } = {},
  { near = [0, 0, 0], shown = [true, true, true], titles = {}, flat = false,
    logicalAxes = ["x", "y", "z"] } = {}) {
  const count = flat ? 2 : 3, sorted = ranges.map(range => [...range].sort((a, b) => a - b));
  const corner = near.reduce((bits, end, axis) => bits | end << axis, 0);
  const corners = Array.from({ length: 8 }, (_, index) => sorted.map((range, axis) => range[index >> axis & 1]));
  const edges = [], ticks = [], grids = [];
  for (let index = 0; index < (flat ? 4 : 8); index++) for (let axis = 0; axis < count; axis++) {
    if (index & 1 << axis || !shown[axis]) continue;
    const primary = index === (corner & ~(1 << axis));
    if (style === "triad" && !primary) continue;
    edges.push({ axis: "xyz"[axis], primary, points: [corners[index], corners[index | 1 << axis]] });
  }
  for (let axis = 0; axis < count; axis++) {
    if (!shown[axis]) continue;
    const name = "xyz"[axis], layout = layouts[axis], config = layout.config;
    const at = fraction => {
      const point = [...corners[corner]];
      point[axis] = sorted[axis][0] + fraction * (sorted[axis][1] - sorted[axis][0]);
      return point;
    };
    for (const [minor, entries] of [[false, layout.major], [true, layout.minor ?? []]]) {
      if (minor ? !config.minor : !config.major) continue;
      for (const tick of entries) ticks.push({ axis: name, position: at(tick.fraction),
        label: tick.label, minor, showLabel: !minor && tick.showLabel, showTick: config.ticks !== false });
    }
    if (titles[name]) ticks.push({ axis: name, position: at(config.titlePosition === "start" ? 0 :
      config.titlePosition === "middle" ? .5 : 1), label: titles[name], title: true, showLabel: true });
  }
  if (!flat) for (const plane of gridPlanes) {
    const dims = [...plane].map(axis => logicalAxes.indexOf(axis)), fixed = [0, 1, 2].find(axis => !dims.includes(axis));
    for (const axis of dims) {
      if (!shown[axis] || layouts[axis].config.grid === "off") continue;
      const other = dims.find(value => value !== axis), layout = layouts[axis];
      const entries = [...layout.major.map(tick => ({ ...tick, minor: false })),
        ...(layout.config.grid === "major-minor" ? (layout.minor ?? []).map(tick => ({ ...tick, minor: true })) : [])];
      for (const tick of entries) {
        if (tick.fraction <= 1e-9 || tick.fraction >= 1 - 1e-9) continue;
        const p = [...corners[corner]];
        p[fixed] = sorted[fixed][1 - near[fixed]];
        p[axis] = sorted[axis][0] + tick.fraction * (sorted[axis][1] - sorted[axis][0]);
        const a = [...p], b = [...p]; a[other] = sorted[other][0]; b[other] = sorted[other][1];
        grids.push({ axis: "xyz"[axis], plane, minor: tick.minor, points: [a, b] });
      }
    }
  }
  return { edges, ticks, grids, center: sorted.map(range => (range[0] + range[1]) / 2) };
}
