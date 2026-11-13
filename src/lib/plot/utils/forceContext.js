/**
 * Layout rendering and dragging capabilities, separate from the graph table relationship.
 * Nodes and Edges select data without this context; layouts optionally register the views that
 * draw them (their services, utils/viewServices.ts) here for settling, bounds policy and Force
 * dragging.
 */
import { sameRows } from "./dataView.js";

export const FORCE_CONTEXT = Symbol("force scopes");
const relationOwners = new WeakMap(), viewOwners = new WeakMap();

/** Optional local data suspends inherited layout policy; returning to inherited data restores it. */
export function layoutBoundary(context, inherited) {
  if (!context) return undefined;
  const boundary = Object.create(context, {
    layoutEnabled: { get: () => context.layoutEnabled !== false && Boolean(inherited()) },
  });
  relationOwners.set(boundary, relationOwners.get(context) ?? context);
  return boundary;
}

/** Select a relation's rendering policy without putting layout state on its table. */
export function layoutRelation(context, relation, drag = () => false) {
  if (!context) return undefined;
  const scoped = Object.create(context, {
    relation: { value: relation },
    dragEnabled: { get: () => relation === "nodes" && Boolean(drag()) },
  });
  relationOwners.set(scoped, relationOwners.get(context) ?? context);
  return scoped;
}

/** Above-Plot selectors have no view; their drawing children register theirs instead. */
export function registerLayoutView(context, view) {
  if (context?.layoutEnabled === false) return () => {};
  const owner = context && (relationOwners.get(context) ?? context);
  if (!owner?.registerView || !view) return () => {};
  let views = viewOwners.get(owner);
  if (!views) viewOwners.set(owner, views = new WeakMap());
  let entry = views.get(view);
  if (!entry) {
    entry = { users: 0, release: owner.registerView(view) };
    views.set(view, entry);
  }
  entry.users++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry.users === 0) { views.delete(view); entry.release?.(); }
  };
}

/**
 * Force drag moves the simulation node at the picked row. A mark below a transform that
 * selects, reorders or aggregates rows (Filter, Sort, Sample, Group) would move another node.
 */
export function forceDragRows(force, scope) {
  if (!force) return null;
  try { return sameRows(scope, force.read("nodes")) ? force : null; }
  catch { return null; }
}

/** An explicit mark drag setting overrides inherited Force dragging. */
export function markLayoutPolicy(context, drag) {
  if (context?.layoutEnabled === false) return { iterative: false, force: null };
  return {
    iterative: Boolean(context && context.iterative !== false),
    force: context?.relation === "nodes" && context.dragEnabled && drag === undefined &&
      typeof context.select === "function" && typeof context.constrain === "function" ? context : null,
  };
}
