import { tick } from "svelte";
import { numpy as np } from "@hmplot/jax";
import { markAnimation } from "./markAnimation.js";
import type { Array as JaxArray } from "@hmplot/jax";
import type { BasePlotObject } from "../objects/base.js";
import type { PlotRenderer, PreparedMark, ViewServices } from "./internalTypes.js";
import { keyedLifecycle } from "./keyedLifecycle.js";
import { animationClock } from "./animation.js";
import { settleUploads } from '../rendering/uploadSettlement.js';
import { trackPreparation } from '../rendering/viewSettlement.js';
import { retirePrepared } from "../binding/preparedMarkDisposal.js";

type Transition = ReturnType<typeof keyedLifecycle>;
type Entry = PreparedMark;

/** Displayed keyed frames have their own revision, separate from requests and field writes. */
export function createDisplayedFrames({ renderer, view, getKind, getMark, isAlive, display, report }: {
  renderer: PlotRenderer;
  /** The view drawing the frames: retirement and settling wait for its uploads. */
  view: ViewServices;
  getKind(): string;
  getMark(): BasePlotObject | undefined;
  isAlive(): boolean;
  display(entry: Entry): void;
  report(error: unknown): void;
}) {
  // A keyed staging frame: fields read this when their update is queued and carry each
  // row's transition state to its new index instead of animating (see keyedLifecycle).
  const stage = (staging: NonNullable<Transition>["staging"] | null) => {
    const mark = getMark();
    if (mark) markAnimation(mark).staging = staging;
  };
  /**
   * A padded animated mark (TODO 32.12): rows the frame on screen hid take their new values at
   * once in the frame that shows them, as rows entering a compacted view do; the others move.
   * -1 marks them, per row of the frame written: the same physical rows, or a keyed union's
   * (its rows map to the old ones through staging.index). Null when nothing can have been hidden.
   */
  function paddedSnapRows(
    old: Entry | null | undefined,
    next: Entry,
    transition: Transition,
  ) {
    if (
      !next.paddedMode ||
      !next.lifecycleConfig?.animates ||
      !old?.paddedMode ||
      !old.valid
    )
      return null;
    const shown = old.valid.ref.greater(0).astype(np.int32);
    if (!transition) {
      if (next.valid?.shape[0] !== shown.shape[0]) {
        shown.dispose();
        return null;
      }
      return np
        .where(shown.greater(0), np.arange(shown.shape[0]).astype(np.int32), -1)
        .astype(np.int32);
    }
    const oldRows = transition.staging?.index;
    if (!oldRows || transition.staging.oldRows !== shown.shape[0]) {
      shown.dispose();
      return null;
    }
    const index = np.array(oldRows, { dtype: np.int32 });
    const before = np
      .take(shown, np.maximum(index.ref, 0), 0)
      .mul(index.greaterEqual(0).astype(np.int32));
    return np
      .where(before.greater(0), np.arange(oldRows.length).astype(np.int32), -1)
      .astype(np.int32);
  }
  const snap = (rows: JaxArray | null) => {
    const mark = getMark();
    if (mark) markAnimation(mark).snapRows = rows;
  };
  /** Set `rows` for the writes the next frame queues, then clear it and release it once they land. */
  function snapFrame(rows: JaxArray | null) {
    if (!rows) return;
    snap(rows);
    (async () => {
      await tick();
      const mark = getMark();
      if (mark && markAnimation(mark).snapRows === rows) snap(null);
      await settleUploads(view);
    })().finally(() => rows.dispose());
  }

  let active: Transition = null;
  let revision = 0;

  function cancel() {
    revision++;
    retirePrepared(view, active);
    active = null;
  }

  function show(previous: Entry | null | undefined, next: Entry, cause?: number) {
    const transition = (next.arrive || next.schemeReset) ? null : keyedLifecycle(active?.shown() ?? previous, next, getKind(), next.lifecycleConfig);
    const token = ++revision;
    retirePrepared(view, active);
    active = transition;
    if (transition?.source.lifecycleOpacity) getMark()?.ensureInteractionOpacity();
    const rows = paddedSnapRows(previous, next, transition);
    stage(transition?.staging ?? null);
    if (!transition) snapFrame(rows);
    display(transition?.source ?? next);
    retirePrepared(view, previous);
    if (!transition) return;

    const current = () => isAlive() && token === revision;
    // Settling includes writing the target, not the entire animation. A frozen export clock
    // must retain departing rows until the mark's own transitions finish.
    const shownTarget = (async () => {
      await tick();
      await settleUploads(view);
      if (!current()) { rows?.dispose(); return false; }
      stage(null);
      transition.show("target");
      snapFrame(rows);
      display(transition.target);
      await tick();
      await settleUploads(view);
      return true;
    })();
    trackPreparation(view, shownTarget.catch(() => {}), cause);
    const finish = (async () => {
      if (!(await shownTarget)) return;
      const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (!reduced && transition.duration)
        await animationClock(renderer).finished({ owner: getMark(), cap: transition.duration * 2 + 100 });
      await settleUploads(view);
      if (!current()) return;
      stage(transition.finalStaging);
      display(next);
      active = null;
      await tick();
      if (current()) stage(null);
      await settleUploads(view);
      transition.dispose();
    })();
    finish.catch((error) => { if (current()) report(error); });
  }
  return { show, cancel, get active() { return active; } };
}
