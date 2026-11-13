// @ts-check
/**
 * A view's gesture (TODO 136.8): the viewer moving the view or a brush, as one span of time. A
 * press that drags (a pan, an orbit, a brush, a dragged node) begins one and its release ends
 * it; a wheel burst begins one and ends WHEEL_IDLE_MS after its last event. A press that does
 * not move (a click) is not a gesture. The layout solver reads it (136.10 freezes gutters during
 * one). whenSettled does not wait for it: a held drag's changes settle as they are made (tests
 * and scripts settle mid-drag). Animation playback is not a gesture: a looping Playback would
 * never end. An animated view change (a viewport or camera prop easing to its new value, TODO
 * 136.14) holds one while it runs, and the viewer's own drag or wheel cancels it.
 */
export const WHEEL_IDLE_MS = 150;

/** @param {{ wheelIdle?: number }} [options] */
export function createGesture({ wheelIdle = WHEEL_IDLE_MS } = {}) {
  /** @type {Set<number>} */
  const pressed = new Set(),
    dragging = new Set();
  /** @type {Set<(active: boolean) => void>} */
  const listeners = new Set();
  /** @type {Array<() => void>} */
  let waiters = [],
    /** @type {Array<() => void>} */
    released = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let wheelTimer = null;
  let was = false,
    held = 0;
  const active = () => dragging.size > 0 || wheelTimer !== null || held > 0;
  const changed = () => {
    const now = active();
    if (now === was) return;
    was = now;
    for (const listener of [...listeners]) listener(now);
    if (now) return;
    const done = waiters;
    waiters = [];
    for (const resolve of done) resolve();
  };
  return {
    /** Whether the viewer is in a gesture now. */
    get active() {
      return active();
    },
    /** A pointer went down (not yet a gesture). @param {number} id */
    press(id) {
      pressed.add(id);
    },
    /** A pointer moved: a pressed one drags, which begins the gesture. @param {number} id */
    move(id) {
      if (!pressed.has(id) || dragging.has(id)) return;
      dragging.add(id);
      changed();
    },
    /** A pointer went up or was cancelled. @param {number} id */
    release(id) {
      pressed.delete(id);
      if (dragging.delete(id)) changed();
    },
    /** A wheel event: the burst goes on until WHEEL_IDLE_MS pass without one. */
    wheel() {
      if (wheelTimer !== null) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelTimer = null;
        changed();
      }, wheelIdle);
      changed();
    },
    /** Hold a gesture while an animated view change runs; returns its release (once). */
    hold() {
      held++;
      changed();
      let done = false;
      return () => {
        if (done) return;
        done = true;
        held--;
        changed();
        if (held) return;
        const waiting = released;
        released = [];
        for (const resolve of waiting) resolve();
      };
    },
    /** End every part of it at once (the window lost focus, the view unmounts). */
    cancel() {
      pressed.clear();
      dragging.clear();
      if (wheelTimer !== null) clearTimeout(wheelTimer);
      wheelTimer = null;
      changed();
    },
    /** Resolves when no gesture is active (at once if none is). @returns {Promise<void>} */
    whenIdle() {
      return active()
        ? new Promise((resolve) => waiters.push(resolve))
        : Promise.resolve();
    },
    /** Resolves when no animated view change holds it (at once if none does). @returns {Promise<void>} */
    whenReleased() {
      return held ? new Promise((resolve) => released.push(resolve)) : Promise.resolve();
    },
    /** Hear the gesture begin (true) and end (false); returns the release. @param {(active: boolean) => void} listener */
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
