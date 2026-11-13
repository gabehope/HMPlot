import { viewContextOf } from "./viewContext.js";
import { countWork } from "./workCounters.js";

// A read-only view of the options that produced a completed canvas frame.
// Preserve the frame ancestry used by geographic and nested-frame guides. A node whose options
// and ancestry have not changed since its last snapshot (their revisions, TODO 143.4) gives
// that snapshot again: a frame that changes nothing in the options snapshots nothing.
const kept = new WeakMap();
/** The revisions of `options`, its defaults, parents and plot styles, and its view context, as one
 * key: equal keys, equal options. NaN in it: a node that keeps no revision (a proxy). */
export const revisionKey = (options, seen = new Set()) => {
  if (!options || seen.has(options)) return "";
  seen.add(options);
  const context = viewContextOf(options);
  return `${options.revision ?? NaN}:${context ? `${context.mode}/${context.radialExtent}/${JSON.stringify(context.explicitViewport ?? null)}` : ""}(` +
    `${revisionKey(options.defaults, seen)},${revisionKey(options.parent, seen)},` +
    `${options.hasChild?.("plot") ? revisionKey(options.child("plot"), seen) : ""})`;
};
export function snapshotAxisOptions(options, captured = new Map()) {
  if (!options) return options;
  if (captured.has(options)) return captured.get(options);
  const key = revisionKey(options), last = kept.get(options);
  if (last?.key === key && !key.includes("NaN")) {
    captured.set(options, last.snapshot);
    return last.snapshot;
  }
  const snapshot = snapshotNode(options, captured);
  kept.set(options, { key, snapshot });
  return snapshot;
}
function snapshotNode(options, captured) {
  countWork("optionSnapshot");
  const snapshot = Object.create(options);
  captured.set(options, snapshot);
  const values = new Map(options.keys.map(key => [key, options.get(key)]));
  snapshot.get = key => values.get(key);
  snapshot.on = () => () => {};
  // The view context (TODO 136.12) as it was, too: the live one is on the prototype chain.
  const context = viewContextOf(options);
  snapshot.viewContext = context && {
    mode: context.mode,
    explicitViewport: context.explicitViewport,
    radialExtent: context.radialExtent,
    on: () => () => {},
  };
  snapshot.defaults = snapshotAxisOptions(options.defaults, captured);
  snapshot.parent = snapshotAxisOptions(options.parent, captured);
  const children = new Map();
  snapshot.child = key => children.get(key);
  if (options.hasChild("plot")) children.set("plot", snapshotAxisOptions(options.child("plot"), captured));
  return snapshot;
}
