// @ts-check
export const ROOT_CONTENT_CONTEXT = Symbol("logical Plot content owner");

/** Reserve a wrapper's logical slot while it prepares children asynchronously.
 * The wrapper releases the slot after those children have mounted (or failed).
 * @param {import('./internalTypes.js').RootContentContext | null | undefined} owner
 * @returns {import('./internalTypes.js').Release}
 */
export function pendingRootContent(owner) {
  const unregister =
    owner?.register({
      kind: "pending",
      key: crypto.randomUUID(),
      parentKey: owner.parentKey,
    }) ?? (() => {});
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unregister();
  };
}

/**
 * Select the logical coordinate root from component ownership, never from DOM
 * order or frame registration order. Data and transform wrappers forward the
 * same owner, so they do not appear in this input.
 *
 * A frame contains its descendants; only direct children of the Plot count as
 * sibling roots. Decorations have no plotted content. A Facet or Partition
 * owns a spatial layout and therefore cannot be promoted to the Plot root.
 * @param {readonly import('./internalTypes.js').RootContentEntry[]} entries
 * @returns {string | null | undefined} Undefined means the selection is still pending;
 * null selects the Plot's implicit root. A string selects the lone eligible Frame.
 */
export function selectRootFrame(entries) {
  const top = entries.filter((entry) => entry.parentKey == null);
  if (top.some((entry) => entry.kind === "pending")) return undefined;
  if (top.some((entry) => entry.kind === "content" || entry.kind === "spatial"))
    return null;
  const frames = top.filter((entry) => entry.kind === "frame");
  if (frames.length !== 1) return null;
  const frame = frames[0];
  if (frame.ranged || frame.placed || frame.spatial) return null;
  return frame.key;
}
