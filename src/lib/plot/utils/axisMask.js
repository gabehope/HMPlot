import { Vector3 } from "three/webgpu";
import { uniform, screenUV, float } from "three/tsl";
import { framePoint, framePointOperations } from "./framePlacement.js";
import { cartesian2D } from "./axisStyle.js";

/** Masks follow the same frame chain as marks; a placement starts a fresh rectangular surface. */
export function cartesianMaskSupported(options) {
  if (!cartesian2D(options)) return false;
  for (let node = options; node; node = node.defaults) {
    if (!node.frameDefinition) continue;
    if (node.get("coordinates") !== "cartesian") return false;
    if (node.frameDefinition.placement) break;
  }
  return options.get("coordinates") === "cartesian";
}

export function rectanglePolygon({ left, right, top, bottom }) {
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

/** Frame domain corners, projected by this pass's camera (also handles rotated placements). */
export function frameMaskPolygon(options, camera, width, height) {
  const x = options.get("xbounds"), y = options.get("ybounds");
  if (!x || !y || !(width > 0 && height > 0)) return [];
  const context = { camera, width, height, operations: framePointOperations(options, { camera, width, height }) };
  const points = [[x[0], y[0]], [x[1], y[0]], [x[1], y[1]], [x[0], y[1]]].map(([a, b]) => {
    const point = new Vector3(...framePoint(options, [a, b, 0], context)).project(camera);
    return [(point.x + 1) * width / 2, (1 - point.y) * height / 2];
  });
  return points.every(p => p.every(Number.isFinite)) ? points : [];
}

/** Four inward half planes, shared by fragment masks and CPU containment tests. */
export function polygonPlanes(points) {
  if (points.length !== 4) return [[0, 0, -1], [0, 0, 1], [0, 0, 1], [0, 0, 1]];
  const center = points.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
  return points.map((a, index) => {
    const b = points[(index + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (!(length > 1e-12)) return [0, 0, -1];
    const sign = -dy * (center[0] - a[0]) + dx * (center[1] - a[1]) >= 0 ? 1 : -1;
    const nx = -dy / length * sign, ny = dx / length * sign;
    return [nx, ny, -nx * a[0] - ny * a[1]];
  });
}

export function insideAxisMasks(point, polygons) {
  return polygons.every(polygon => polygonPlanes(polygon).every(([a, b, c]) => a * point[0] + b * point[1] + c >= -1e-8));
}

function maskFrames(options) {
  const frames = [];
  for (let node = options; node; node = node.defaults)
    if (node.frameDefinition?.maskBoundary) frames.push(node.frameDefinition);
  return frames;
}

export function axisMaskPolygons(options, camera, width, height) {
  return maskFrames(options).map(frame => frame.maskBoundary(camera, width, height)).filter(polygon => polygon !== null);
}

// Copying a beauty material for picking copies its mask node. Unwrap our own composition
// before attaching it to that copy so rebuilding a picking material cannot duplicate the graph.
const composedMasks = new WeakMap();

/** Install once per data mark, not on guide meshes. Numerical changes update uniforms only. */
export function installAxisMask(mark) {
  if (!mark?.material || !mark.options) return () => {};
  const frames = maskFrames(mark.options);
  if (!frames.length) return () => {};
  const uniforms = frames.map(() => ({ enabled: uniform(0), planes: Array.from({ length: 4 }, () => uniform(new Vector3(0, 0, 1))) }));
  let mask = float(1).greaterThan(0);
  for (const entry of uniforms) {
    let inside = float(1).greaterThan(0);
    for (const plane of entry.planes) inside = inside.and(screenUV.x.mul(plane.x).add(screenUV.y.mul(plane.y)).add(plane.z).greaterThanEqual(0));
    mask = mask.and(entry.enabled.lessThan(0.5).or(inside));
  }
  const materials = new Map();
  const attach = material => {
    if (!material?.isNodeMaterial || materials.has(material)) return;
    let source = material.maskNode ?? null, combined;
    const strip = value => composedMasks.get(value)?.owner === mark ? composedMasks.get(value).source : value;
    const set = value => {
      source = strip(value);
      combined = source ? source.and(mask) : mask;
      composedMasks.set(combined, { owner: mark, source });
    };
    set(source);
    Object.defineProperty(material, "maskNode", { configurable: true, enumerable: true, get: () => combined, set });
    const restore = () => {
      material.removeEventListener("dispose", release);
      Object.defineProperty(material, "maskNode", { configurable: true, enumerable: true, writable: true, value: source });
    };
    const release = () => { restore(); materials.delete(material); };
    material.addEventListener("dispose", release);
    materials.set(material, restore);
    material.needsUpdate = true;
  };
  let material = mark.material;
  attach(material);
  Object.defineProperty(mark, "material", { configurable: true, enumerable: true, get: () => material, set: value => { material = value; attach(value); } });
  const before = mark.onBeforeRender;
  const update = function(renderer, scene, camera, ...rest) {
    before?.call(this, renderer, scene, camera, ...rest);
    const target = renderer.getRenderTarget(), ratio = renderer.getPixelRatio() * (mark.renderScaleNode?.value || 1);
    const width = (target?.width ?? renderer.domElement.width) / ratio, height = (target?.height ?? renderer.domElement.height) / ratio;
    for (let i = 0; i < frames.length; i++) {
      const points = frames[i].maskBoundary(camera, width, height), entry = uniforms[i];
      entry.enabled.value = points === null ? 0 : 1;
      if (points === null) continue;
      const planes = polygonPlanes(points.map(([x, y]) => [x / width, y / height]));
      for (let edge = 0; edge < 4; edge++) entry.planes[edge].value.fromArray(planes[edge]);
    }
  };
  mark.onBeforeRender = update;
  return () => {
    if (mark.onBeforeRender === update) mark.onBeforeRender = before;
    Object.defineProperty(mark, "material", { configurable: true, enumerable: true, writable: true, value: material });
    for (const restore of materials.values()) restore();
    materials.clear();
  };
}

/** SVG/PDF consume the same boundary polygons; nested groups intersect ancestor masks. */
export function axisMaskElements(elements, polygons, id) {
  if (!polygons.length) return elements;
  let children = elements;
  const definitions = [];
  for (let i = 0; i < polygons.length; i++) {
    const clipId = `${id}-${i}`;
    definitions.push({ type: "clipPath", attrs: { id: clipId, clipPathUnits: "userSpaceOnUse" }, children: [
      { type: "polygon", attrs: { points: polygons[i].map(point => point.join(",")).join(" ") } },
    ] });
    children = [{ type: "g", attrs: { "clip-path": `url(#${clipId})` }, children }];
  }
  return [{ type: "defs", children: definitions }, ...children];
}
