/**
 * A mark's animation state: one record per mark, kept here (TODO 32.11). Before, each module
 * that needed a piece of it set its own animation* property on the mark object. A field's
 * version counters and a buffer's own transition state stay on the field and the buffer.
 */
const records = new WeakMap();

/** The record for `mark`, created on first use. */
export function markAnimation(mark) {
  let record = records.get(mark);
  if (!record)
    records.set(
      mark,
      (record = {
        // The mark has drawn a frame (interactive.svelte): its first data never transitions.
        ready: false,
        // The last update changed the row shape or the category topology (data.js
        // updateFields), so it snaps; `shape` and `topology` are that update's.
        snap: false,
        shape: undefined,
        topology: undefined,
        // A live view gives the mark new data every frame: implicit transitions snap (TODO 28).
        live: false,
        // The update comes from a live drag of offsets: rows whose values changed arrive at
        // once, and the others keep their motion (TODO 38 decision 7).
        arrive: false,
        // Only the publication changing correspondence snaps unchanged pending targets.
        schemeReset: false,
        // Per field or option: explicit animate()/tween() components (`specs`), and the
        // implicit transition's scale-space kinds (`kinds`). Set by namedMark.svelte.
        specs: null,
        kinds: null,
        // The keyed staging frame being written (namedMark.svelte, keyedLifecycle.js).
        staging: null,
        // A padded mark's frame being written: -1 for each row hidden before it, which takes its
        // new values at once (int32 device array; namedMark.svelte, TODO 32.12).
        snapRows: null,
        // The GPU flag word the mark's row transitions share, cleared once per update batch.
        flags: null,
        flagsBatch: undefined,
        // Bumped for every transition frame drawn; views key their caches on it.
        version: 0,
        // Uniform transitions by option key (uniformTransition).
        uniforms: new Map(),
        // The animated-rows limit was reported.
        limitWarned: false,
      }),
    );
  return record;
}

/** `mark`'s animation version (0 before its first transition frame), for cache keys. */
export const animationVersion = (mark) => records.get(mark)?.version ?? 0;
