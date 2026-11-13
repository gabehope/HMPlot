import { Matrix4, Vector3 } from "three/webgpu";
import { framePointOperations } from "./framePlacement.js";
import {
  applyCoordinateOperations,
  inverseCoordinateOperations,
} from "./coordinateOperations.js";
import { axisMaskPolygons, insideAxisMasks } from "./axisMask.js";
import { coordinateView } from "./viewContext.js";
import { createFrameScale } from "./frameMapping.js";

export const HTML_CONTEXT = Symbol("hmplot html overlay");

/** A public component can replace its internal renderer when a data scope changes.
 * Preserve its subscriptions and revision sequence across that replacement. */
export function createScreenMappingRelay() {
  let current = null,
    revision = 0,
    stop,
    disposed = false;
  const listeners = new Set();
  const publish = (value) => {
    if (value === null && current === null) return;
    current = value ? Object.freeze({ ...value, revision: ++revision }) : null;
    for (const listener of [...listeners]) listener(current);
  };
  return {
    getScreenMapping: () => current,
    subscribeScreenMapping(listener) {
      if (!disposed) listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    connect(handle) {
      stop?.();
      stop = undefined;
      if (disposed) return;
      publish(null);
      stop = handle?.subscribeScreenMapping(publish);
    },
    dispose() {
      stop?.();
      stop = undefined;
      disposed = true;
      publish(null);
      listeners.clear();
    },
  };
}

// Capture numerical stages, never live OptionsNodes. Holding a public snapshot must
// not retain a renderer or change its answers when scales animate or props change.
function capture(options, camera, width, height) {
  if (
    !camera?.isOrthographicCamera ||
    coordinateView(options) !== "2d" ||
    !(width > 0 && height > 0)
  )
    return null;
  for (let node = options; node; node = node.defaults) {
    if (
      node.get("coordinates") !== "cartesian" ||
      node.categoryAxes?.x ||
      node.categoryAxes?.y
    )
      return null;
  }
  const operations = framePointOperations(options, {
    camera,
    width,
    height,
  }).map((operation) => {
    if (operation.kind === "matrix") {
      const elements = [...operation.elements];
      // v1 supports planar placements, including rotation in the screen plane.
      if (
        Math.abs(elements[2]) + Math.abs(elements[6]) > 1e-10 ||
        Math.abs(new Matrix4().fromArray(elements).determinant()) < 1e-12
      )
        throw Error("unsupported placement");
      return { kind: "matrix", elements, inverse: [...operation.inverse] };
    }
    if (operation.kind !== "scale") throw Error("unsupported coordinates");
    return {
      kind: "scale",
      axes: Object.fromEntries(
        Object.entries(operation.axes ?? {}).map(([axis, stage]) => {
          const source = stage.source;
          const scale = {
            domain: [...source.get(axis + "bounds")],
            range: [...source.get(stage.rangeKey)],
            transform: source.get(axis + "Transform") ?? "linear",
            constant: source.get(axis + "TransformConstant") ?? 1,
          };
          createFrameScale(scale);
          return [axis, scale];
        }),
      ),
    };
  });
  const eye = camera.clone();
  eye.matrixWorld.copy(camera.matrixWorld);
  eye.matrixWorldInverse.copy(camera.matrixWorldInverse);
  const polygons = axisMaskPolygons(options, camera, width, height).map(
    (polygon) => polygon.map((point) => [...point]),
  );
  const key = JSON.stringify([
    width,
    height,
    operations,
    eye.projectionMatrix.elements,
    eye.matrixWorld.elements,
    polygons,
  ]);
  const origin = ["x", "y"].map(
    (axis) =>
      operations.find((op) => op.kind === "scale" && op.axes[axis])?.axes[axis]
        .domain[0] ?? 0,
  );
  const worldZ = applyCoordinateOperations([...origin, 0], operations)?.[2];
  if (!Number.isFinite(worldZ)) return null;
  return { operations, eye, polygons, key, width, height, worldZ };
}

function mapping(snapshot, revision) {
  const { operations, eye, polygons, width, height, worldZ } = snapshot;
  const valid = (point) =>
    point && Number.isFinite(point.x) && Number.isFinite(point.y);
  return Object.freeze({
    width,
    height,
    revision,
    project(point) {
      if (!valid(point)) return null;
      try {
        const world = applyCoordinateOperations(
          [point.x, point.y, 0],
          operations,
        );
        if (!world?.every(Number.isFinite)) return null;
        const p = new Vector3(...world).project(eye);
        const x = ((p.x + 1) * width) / 2,
          y = ((1 - p.y) * height) / 2;
        if (![x, y].every(Number.isFinite)) return null;
        return {
          x,
          y,
          inside:
            x >= 0 &&
            x <= width &&
            y >= 0 &&
            y <= height &&
            insideAxisMasks([x, y], polygons),
        };
      } catch {
        return null;
      }
    },
    unproject(point) {
      if (!valid(point)) return null;
      try {
        // Orthographic screen rays intersect the frame's planar world surface.
        const origin = new Vector3(
          (2 * point.x) / width - 1,
          1 - (2 * point.y) / height,
          0,
        ).unproject(eye);
        const direction = new Vector3(0, 0, -1).transformDirection(
          eye.matrixWorld,
        );
        if (Math.abs(direction.z) < 1e-12) return null;
        origin.addScaledVector(direction, (worldZ - origin.z) / direction.z);
        const result = inverseCoordinateOperations(
          origin.toArray(),
          operations,
        );
        return result &&
          Number.isFinite(result[0]) &&
          Number.isFinite(result[1])
          ? { x: result[0], y: result[1] }
          : null;
      } catch {
        return null;
      }
    },
  });
}

/** One frame's displayed mapping. The owner calls draw only after a completed beauty pass. */
export function createScreenMapping(read) {
  let current = null,
    key = null,
    revision = 0,
    disposed = false;
  const listeners = new Set();
  const emit = () => {
    for (const listener of [...listeners]) listener(current);
  };
  return {
    getScreenMapping: () => current,
    subscribeScreenMapping(listener) {
      if (!disposed) listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    draw() {
      if (disposed) return;
      let next;
      try {
        const { options, camera, width, height } = read();
        next = capture(options, camera, width, height);
      } catch {
        next = null;
      }
      if ((next?.key ?? null) === key) return;
      key = next?.key ?? null;
      current = next ? mapping(next, ++revision) : null;
      emit();
    },
    dispose() {
      disposed = true;
      current = null;
      key = null;
      emit();
      listeners.clear();
    },
  };
}
