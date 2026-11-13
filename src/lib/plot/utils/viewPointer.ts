// The view's pointer geometry (out of viewCore.svelte, Stage 118.5): canvas pixels, the world
// the camera shows, and the pointer and visible domain in a frame's data.
import * as THREE from "three/webgpu";
import { readAxis } from "./axes.js";
import { axisCategory } from "./categorical.js";
import { placedFrame } from "./framePlacement.js";
import { angularPeriod } from "./coordinates.js";
import type {
  FrameEntry,
  FrameOptions,
  ViewFrame,
  ViewServices,
} from "./internalTypes.js";

/** What the geometry reads from its view, current at each call. */
export interface ViewPointerHost {
  readonly canvasHost: HTMLDivElement | undefined;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** The world the camera shows (ViewTelemetry), or null before its first frame. */
  readonly viewFrame: ViewFrame | null;
  readonly frames: readonly FrameEntry[];
  readonly mode: string;
  /** The view's services: the picking context's axisValue and the 3D camera. */
  readonly view: ViewServices;
}
/** A frame's data at a canvas point; NaN where the pointer misses an axis. */
export interface FramePointer {
  x: unknown;
  y: unknown;
}
/** A frame's visible domain, per axis. */
export interface VisibleDomain {
  x: number[];
  y: number[];
}

export function createViewPointer(host: ViewPointerHost) {
  function localPointer(event: MouseEvent) {
    const rect = host.canvasHost!.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }
  function canvasSize(axis: string) {
    return (
      (axis === "x"
        ? host.canvasWidth || host.canvasHost?.clientWidth
        : host.canvasHeight || host.canvasHost?.clientHeight) || 1
    );
  }
  function worldAt(axis: string, pixel: number) {
    const visible = host.viewFrame?.[axis as "x" | "y"];
    if (!visible) return null;
    const fraction =
      axis === "x" ? pixel / canvasSize(axis) : 1 - pixel / canvasSize(axis);
    return visible[0] + fraction * (visible[1] - visible[0]);
  }
  /**
   * The canvas point in `frame`'s data: { x, y }, or null off the frame (TODO 45). On a 3D globe,
   * where the pointer's ray meets the sphere (missing off it); other 3D frames have no pointer.
   */
  function pointerIn(
    point: number[],
    frame: FrameOptions,
  ): FramePointer | null {
    const picking = host.view.picking.context.current;
    if (!picking?.axisValue) return null;
    if (host.mode === "3d") {
      const camera = host.view.picking.camera.current?.();
      if (
        !camera ||
        frame.get?.("coordinates") !== "spherical" ||
        frame.get("sphericalView") === "projected"
      )
        return null;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          (point[0] / canvasSize("x")) * 2 - 1,
          1 - (point[1] / canvasSize("y")) * 2,
        ),
        camera,
      );
      const hit = ray.ray.intersectSphere(
        new THREE.Sphere(new THREE.Vector3(), frame.get("baseRadius") ?? 1),
        new THREE.Vector3(),
      );
      if (!hit) return null;
      let value;
      try {
        value = picking.axisValue([hit.x, hit.y, hit.z], frame);
      } catch {
        return null;
      }
      return {
        x: pointerValue(frame, "x", value?.x, false),
        y: pointerValue(frame, "y", value?.y, false),
      };
    }
    const x = worldAt("x", point[0]),
      y = worldAt("y", point[1]);
    if (x === null || y === null) return null;
    // A Cartesian frame drawn in a box is off outside it; a polar disk, a map or a placed inset
    // is off outside its domain (pointerValue).
    const entry = host.frames.find((f) => f.options === frame),
      box = entry?.layout && !entry.layout.polar ? entry.layout : null;
    if (
      box &&
      (point[0] < box.left ||
        point[0] > box.right ||
        point[1] < box.top ||
        point[1] > box.bottom)
    )
      return null;
    let value;
    try {
      value = picking.axisValue([x, y, 0], frame);
    } catch {
      return null;
    }
    return {
      x: pointerValue(frame, "x", value?.x, !box),
      y: pointerValue(frame, "y", value?.y, !box),
    };
  }
  /**
   * `frame`'s visible domain (TODO 19): in a Cartesian frame drawn in a box, the data at its box's
   * corners (so it follows pans and zooms; a datetime axis counts from its time origin); in a
   * curved or placed frame, or in 3D, its domain.
   */
  function visibleIn(frame: FrameOptions): VisibleDomain {
    const bounds = (axis: string) => {
      const value = frame.get?.(axis + "bounds");
      return Array.isArray(value)
        ? [Math.min(...value), Math.max(...value)]
        : [NaN, NaN];
    };
    const picking = host.view.picking.context.current;
    const entry = host.frames.find((f) => f.options === frame),
      box = entry?.layout && !entry.layout.polar ? entry.layout : null;
    // A polar frame's angles are its whole circle, whatever the domain of the data on it.
    if (frame.get?.("coordinates") === "polar") {
      const origin = frame.get("angleUnit") === "extent" ? bounds("x")[0] : 0;
      return { x: [origin, origin + angularPeriod(frame)], y: bounds("y") };
    }
    if (!box || host.mode !== "2d" || !picking?.axisValue || placedFrame(frame))
      return { x: bounds("x"), y: bounds("y") };
    const corner = (px: number, py: number) => {
      const x = worldAt("x", px),
        y = worldAt("y", py);
      if (x === null || y === null) return null;
      try {
        return picking!.axisValue!([x, y, 0], frame);
      } catch {
        return null;
      }
    };
    const a = corner(box.left, box.bottom),
      b = corner(box.right, box.top);
    if (!a || !b) return { x: bounds("x"), y: bounds("y") };
    const range = (axis: string, u: number, v: number) => {
      const origin =
        readAxis(frame, axis)?.type === "datetime"
          ? readAxis(frame, axis).timeOrigin
          : 0;
      return [Math.min(u, v) - origin, Math.max(u, v) - origin];
    };
    return { x: range("x", a.x, b.x), y: range("y", a.y, b.y) };
  }
  function pointerValue(
    frame: FrameOptions,
    axis: string,
    value: unknown,
    bounded: boolean,
  ) {
    if (typeof value !== "number" || !Number.isFinite(value)) return NaN;
    // A band axis: the category under the pointer (decision 5).
    const scale = axisCategory(frame, axis);
    if (scale) {
      const at = Math.round(value);
      return at >= 0 && at < scale.domain.length ? scale.domain[at] : NaN;
    }
    // A datetime axis counts from its time origin, as the marks on it draw.
    const config = readAxis(frame, axis);
    if (config?.type === "datetime") value -= config.timeOrigin;
    if (bounded) {
      const bounds = frame.get?.(axis + "bounds");
      if (
        Array.isArray(bounds) &&
        (value < Math.min(...bounds) - 1e-9 ||
          value > Math.max(...bounds) + 1e-9)
      )
        return NaN;
    }
    return value;
  }
  return { localPointer, canvasSize, worldAt, pointerIn, visibleIn };
}
