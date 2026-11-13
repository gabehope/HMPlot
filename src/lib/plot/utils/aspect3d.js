import { Vector2 } from "three/webgpu";
import { transformClamped } from "./scaleTransforms.js";
import { coordinateView } from "./viewContext.js";

const axes = ["x", "y", "z"];
const sceneProviders = new WeakMap();

/** One descriptor per root, chosen by the same surface ownership that drives
 * its guides. Surface plots retain their established (x, height, -y) basis. A root's
 * surface is looked up again once `view`'s drawing changed (its revision). */
export function register3dDisplayScene(options, scene, view) {
  let revision, surfaces = new WeakMap();
  const provider = root => {
    if (revision !== view.drawing.revision) {
      revision = view.drawing.revision; surfaces = new WeakMap();
    }
    if (surfaces.has(root)) return surfaces.get(root);
    let surface = null;
    scene.traverse(object => {
      if (surface || !object.surfaceMode || !object.zScaleNode ||
          object.options?.get("coordinates") !== "cartesian" || coordinateView(object.options) !== "3d") return;
      let belongs = false;
      for (let node = object.options; node; node = node.defaults) {
        if (node.frameDefinition?.placement) return;
        if (node === root) belongs = true;
      }
      if (belongs) surface = object;
    });
    surfaces.set(root, surface);
    return surface;
  };
  sceneProviders.set(options, provider);
  return () => { if (sceneProviders.get(options) === provider) sceneProviders.delete(options); };
}

export function frame3dDescriptor(options, { local = false } = {}) {
  const root = local ? options : aspectRoot(options);
  let surface;
  for (let node = root; node; node = node.defaults) {
    const provider = sceneProviders.get(node);
    if (provider) { surface = provider(root); break; }
  }
  const source = surface?.options ?? root;
  return surface ? {
    surface, logicalAxes: ["x", "z", "y"],
    ranges: [source.get("xrange"), [0, source.get("zScale")], source.get("yrange").map(value => -value)],
    domains: [source.get("xbounds"), source.get("valueBounds"), source.get("ybounds")],
    transforms: ["x", "z", "y"].map(axis => source.get(axis + "Transform") ?? "linear"),
    constants: ["x", "z", "y"].map(axis => source.get(axis + "TransformConstant") ?? 1),
  } : {
    surface: null, logicalAxes: axes,
    ranges: axes.map(axis => root.get(axis + "range") ?? [-50, 50]),
    domains: axes.map(axis => root.get(axis + "bounds")),
    transforms: axes.map(axis => root.get(axis + "Transform") ?? "linear"),
    constants: axes.map(axis => root.get(axis + "TransformConstant") ?? 1),
  };
}

/** The root metric belongs to the plot, including marks in inherited Frames. */
export function aspectRoot(options) {
  let frame = options;
  while (frame && !frame.frameDefinition) frame = frame.defaults;
  if (!frame) return options;
  while (frame.frameDefinition?.parent) frame = frame.frameDefinition.parent;
  return frame;
}

/** Keep the range centers and directions, shrinking to a common world length
 * per transformed unit. Bounds/ranges remain authored values; this is a final
 * display metric shared by the CPU, rendering and compute coordinate paths. */
export function aspect3dMetric(options) {
  const root = aspectRoot(options);
  const { ranges, domains, transforms, constants } = frame3dDescriptor(root);
  const enabled = coordinateView(root) === "3d" &&
    (root.get("coordinates") ?? "cartesian") === "cartesian" &&
    root.child?.("plot")?.get("aspect") === "equal";
  const spans = axes.map((axis, index) => {
    const bounds = domains[index], kind = transforms[index], constant = constants[index];
    return bounds ? Math.abs(transformClamped(kind, bounds[1], constant) -
      transformClamped(kind, bounds[0], constant)) : NaN;
  });
  const valid = ranges.map((range, i) => enabled && Number.isFinite(spans[i]) && spans[i] > 0 &&
    range.every(Number.isFinite) && range[0] !== range[1]);
  const ratios = ranges.flatMap((range, i) => valid[i] ? [Math.abs(range[1] - range[0]) / spans[i]] : []);
  const unit = ratios.length ? Math.min(...ratios) : 1;
  const scale = ranges.map((range, i) => valid[i] ? unit * spans[i] / Math.abs(range[1] - range[0]) : 1);
  const center = ranges.map(range => (range[0] + range[1]) / 2);
  const display = ranges.map((range, i) => range.map(value => center[i] + (value - center[i]) * scale[i]));
  return { ranges, scale, center, display };
}

/** Already-normalized world coordinates (e.g. axis guides) use the same metric. */
export function aspect3dPoint(options, point) {
  const { scale, center } = aspect3dMetric(options);
  return point.map((value, i) => center[i] + (value - center[i]) * scale[i]);
}

const sources = new WeakMap();
/** A live Options-like source lets the existing affine scale operation serve
 * the root metric without a second transform implementation or new GPU stage. */
export function aspect3dSource(options) {
  if (coordinateView(options) === "chart") return null;
  const root = aspectRoot(options);
  if (coordinateView(root) !== "3d" ||
      (root.get("coordinates") ?? "cartesian") !== "cartesian") return null;
  let source = sources.get(root);
  if (source) return source;
  const vectors = Object.fromEntries(axes.flatMap(axis => [
    [axis + "bounds", new Vector2()], [axis + "range", new Vector2()],
  ]));
  source = {
    get(key) {
      const index = axes.indexOf(key[0]);
      if (key.endsWith("Transform")) return "linear";
      if (key.endsWith("TransformConstant")) return 1;
      if (index < 0) return undefined;
      const metric = aspect3dMetric(root);
      const range = metric.ranges[index], center = metric.center[index];
      const bounds = range[0] === range[1] ? [center - .5, center + .5] : range;
      return key.endsWith("bounds") ? bounds : key.endsWith("range")
        ? bounds.map(value => center + (value - center) * metric.scale[index]) : undefined;
    },
    transformed: new Proxy({}, { get: (_, key) => {
      const value = source.get(key);
      return vectors[key] ? vectors[key].fromArray(value) : value;
    } }),
  };
  sources.set(root, source);
  return source;
}
