// @ts-check
/**
 * Which pointer states a mark sets (TODO 136.13): a mark whose published binding brushes, hovers
 * or marks rows nearby claims that resource (markBinding.js) until its binding is replaced or
 * released. A Filter on a state nothing claims ("@brushed" on a table no mark brushes) lints:
 * it always keeps the same rows.
 */

/** @type {WeakMap<object, {count: number, listeners: Set<() => void>}>} */
const claims = new WeakMap();
/** @param {object} resource */
const claimsOf = (resource) => {
  let entry = claims.get(resource);
  if (!entry)
    claims.set(resource, (entry = { count: 0, listeners: new Set() }));
  return entry;
};
/** The binding fields of the pointer states a mark sets from the pointer. */
const POINTER_STATES = /** @type {const} */ (["brush", "hover", "nearby"]);

/**
 * Claim the pointer states an interaction binding sets; returns the release.
 * @param {{brush?: object | null, hover?: object | null, nearby?: object | null} | null | undefined} interaction
 */
export function claimPointerStates(interaction) {
  const resources = POINTER_STATES.map((state) => interaction?.[state]).filter(
    (resource) => resource != null,
  );
  for (const resource of resources) {
    const entry = claimsOf(/** @type {object} */ (resource));
    // Listeners hear whether a resource is claimed, not each claim.
    if (entry.count++ === 0) entry.listeners.forEach((listener) => listener());
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const resource of resources) {
      const entry = claimsOf(/** @type {object} */ (resource));
      if (--entry.count === 0)
        entry.listeners.forEach((listener) => listener());
    }
  };
}
/** Whether a mark sets `resource`. @param {object} resource */
export const interactionClaimed = (resource) =>
  (claims.get(resource)?.count ?? 0) > 0;
/**
 * Call `listener` when `resource` becomes claimed or unclaimed; returns the unsubscribe.
 * @param {object} resource @param {() => void} listener
 */
export function onInteractionClaims(resource, listener) {
  const entry = claimsOf(resource);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}
