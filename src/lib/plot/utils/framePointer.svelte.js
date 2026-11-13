// The pointer in the enclosing frame (TODO 45), for a compound mark that follows it (Crosshair's
// readouts): its values, the frame's visible domain, and readouts written finer than the ticks.
// One subscription to the view's pointer tracker (viewCore.svelte, its navigation), none while
// `enabled()` is false; nothing runs while the pointer rests.
import { getContext } from "svelte";
import { useViewServices } from "./viewServices.js";
import { AXIS_CONTEXT } from "./axisFrame.js";
import { axisReadout } from "./axes.js";

const MISSING = Object.freeze({ x: NaN, y: NaN });

/**
 * Call during component initialization. `x` and `y` are the pointer in the frame's data (a
 * category over a band axis; NaN off the frame or without a pointer), `visible` the frame's
 * visible domain ({ x: [min, max], y: [min, max] }, or null), `curved` whether the frame is polar
 * or spherical, `readout(axis)` the value as text ("" when missing), and `format(axis, value)`
 * any value of the axis as its readout writes it.
 * @param {{ enabled?: () => boolean }} [options]
 */
export function framePointer({ enabled = () => true } = {}) {
  const view = useViewServices();
  const frame = getContext(AXIS_CONTEXT);
  let pointer = $state.raw(MISSING), visible = $state.raw(null);
  $effect(() => {
    const tracker = view?.navigation.pointer.current, at = frame?.options;
    if (!enabled() || !tracker || !at) return;
    const read = () => {
      pointer = tracker.at(at);
      visible = tracker.visible(at);
    };
    read();
    return tracker.subscribe(at, read);
  });
  const span = (axis) => (visible?.[axis] ? visible[axis][1] - visible[axis][0] : 0);
  /** `value` on `axis` as its readout writes it (finer than the ticks, by the visible span). @param {"x" | "y"} axis @param {unknown} value */
  const format = (axis, value) => axisReadout(frame?.options, axis, value, span(axis));
  return {
    get x() { return pointer.x; },
    get y() { return pointer.y; },
    get visible() { return visible; },
    get curved() { return ["polar", "spherical"].includes(frame?.options?.get?.("coordinates")); },
    /** @param {"x" | "y"} axis */
    readout: (axis) => format(axis, pointer[axis]),
    format,
  };
}
