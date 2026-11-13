// @ts-check
// Accepted mark bindings (Stage 117.2; docs/REFACTOR-PLAN-2026-10-09.md, "View services and mark
// bindings"). A mark's publisher (namedMark) publishes what its displayed preparation tells the
// code around it, as one MarkBinding per mark object in its view's marks; picking, interaction,
// tooltips, connections, legends and export read it there instead of fields on the object. A
// reader whose work outlives the next publication (an in-flight pick or export) acquires it, as
// a column is acquired (columnReads.js): the binding's scope and rows stay valid until the
// release, whatever is published meanwhile.

import { claimPointerStates } from "./interactionClaims.js";

/**
 * @typedef {import('./internalTypes.js').MarkBinding} MarkBinding
 * @typedef {import('./internalTypes.js').ViewMarks} ViewMarks
 * @typedef {import('./internalTypes.js').ViewServices} ViewServices
 */

/**
 * A view's marks: the binding each mark object was last published with.
 * @returns {ViewMarks}
 */
export function createViewMarks() {
  /** @type {Map<object, MarkBinding>} */
  const bindings = new Map();
  /** @type {Set<(object: object, binding: MarkBinding | undefined) => void>} */
  const listeners = new Set();
  // The pointer states each mark's binding sets (interactionClaims.js, TODO 136.13): a new
  // binding claims before the one it replaces releases, so a re-publish never unclaims.
  /** @type {WeakMap<object, () => void>} */
  const claimed = new WeakMap();
  return {
    of: (object) => (object ? bindings.get(object) : undefined),
    subscribe(listener) {
      listeners.add(listener);
      for (const [object, binding] of bindings) listener(object, binding);
      return () => {
        listeners.delete(listener);
      };
    },
    acquire(object) {
      const value = object ? bindings.get(object) : undefined;
      /** @type {(() => void) | undefined} */
      let release = value?.retain();
      return {
        value,
        release() {
          release?.();
          release = undefined;
        },
      };
    },
    publish(object, binding) {
      bindings.set(object, binding);
      const previous = claimed.get(object);
      claimed.set(object, claimPointerStates(binding.interaction));
      previous?.();
      for (const listener of listeners) listener(object, binding);
      return () => {
        if (bindings.get(object) !== binding) return;
        bindings.delete(object);
        claimed.get(object)?.();
        claimed.delete(object);
        for (const listener of listeners) listener(object, undefined);
      };
    },
  };
}

/**
 * The view a mark object draws in (BasePlotObject's `view`; markComponent gives a plain object
 * one too).
 * @param {unknown} object
 * @returns {ViewServices | undefined}
 */
const viewOf = (object) =>
  object && typeof object === "object" && "view" in object
    ? /** @type {ViewServices | undefined} */ (object.view)
    : undefined;

/**
 * A mark object's accepted binding, read through its view.
 * @param {unknown} object
 * @returns {MarkBinding | undefined}
 */
export function markBinding(object) {
  return viewOf(object)?.marks.of(/** @type {object} */ (object));
}

/**
 * Acquire a mark object's accepted binding for work that reads it after an await.
 * @param {unknown} object
 * @returns {ReturnType<ViewMarks["acquire"]>}
 */
export function acquireMarkBinding(object) {
  return (
    viewOf(object)?.marks.acquire(/** @type {object} */ (object)) ?? {
      value: undefined,
      release() {},
    }
  );
}

/**
 * A binding with nothing yet accepted: no interaction, rows, tooltip, legend, scales or extents.
 * @param {Partial<MarkBinding>} [binding]
 * @returns {MarkBinding}
 */
export function emptyBinding(binding = {}) {
  return {
    kind: null,
    compound: null,
    frameKey: null,
    pickArea: false,
    nearest: null,
    interaction: null,
    rows: { count: null, valid: null },
    tooltip: null,
    legend: null,
    scales: null,
    extents: null,
    retain: () => () => {},
    ...binding,
  };
}

/**
 * @typedef {{ retain?: () => (() => void) | undefined }} RetainedScope
 * @typedef {{
 *   markScope?: RetainedScope | null,
 *   interaction?: { scope?: RetainedScope | null } | null,
 *   valid?: import("@hmplot/jax").Array | null,
 *   interactionIndex?: import("@hmplot/jax").Array | null,
 * }} RetainedPreparation
 */

/**
 * What a reader that acquires a preparation's binding keeps: its scopes and its rows (the valid
 * rows a padded view shows, a series' row index), as they are when it acquires them.
 * @param {RetainedPreparation | null | undefined} entry
 * @returns {MarkBinding["retain"]}
 */
export const retainPreparation = (entry) => () => {
  if (!entry) return () => {};
  const scopes = [
    ...new Set([entry.markScope, entry.interaction?.scope]),
  ].flatMap((scope) => scope?.retain?.() ?? []);
  const arrays = [entry.valid, entry.interactionIndex].flatMap((array) =>
    array ? [array.ref] : [],
  );
  return () => {
    scopes.forEach((release) => release());
    arrays.forEach((array) => array.dispose());
  };
};

/**
 * One mark component's publications: each publish() patches its current binding into a new one
 * for that mark object; a new mark object starts from `base()`.
 * @param {ViewMarks} marks
 * @param {() => Partial<MarkBinding>} base
 */
export function createBindingPublisher(marks, base) {
  /** @type {{ mark: object, binding: MarkBinding, release: () => void } | null} */
  let bound = null;
  /**
   * @param {object | null | undefined} mark
   * @param {Partial<MarkBinding>} patch
   */
  function publish(mark, patch) {
    if (!mark) return;
    if (bound && bound.mark !== mark) release();
    const binding = { ...(bound?.binding ?? emptyBinding(base())), ...patch };
    bound = { mark, binding, release: marks.publish(mark, binding) };
    return binding;
  }
  function release() {
    bound?.release();
    bound = null;
  }
  return {
    publish,
    /**
     * Patch the binding only while `mark` is still the bound one (an effect's cleanup).
     * @param {object | null | undefined} mark
     * @param {Partial<MarkBinding>} patch
     */
    patch(mark, patch) {
      if (mark && bound?.mark === mark) publish(mark, patch);
    },
    release,
  };
}
