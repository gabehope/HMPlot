// @ts-check
// Feedback opacity (a feature controller since Stage 118.3): the per-row opacity a mark draws
// from its accepted interaction binding (selection, hover, brush, nearby and nearest dim the
// rows they leave out), its row opacity column and a keyed lifecycle's fade, written to the
// mark's interactionOpacity field whenever a resource it responds to changes.
import { numpy as np } from "@hmplot/jax";
import { capability } from "./markKinds.js";
import { segmentValues } from "./segmentRows.js";
import {
  responseResources,
  interactionRole,
  interactionPhase,
  selectionMask,
  onMembershipChange,
} from "./interaction.js";

/**
 * @typedef {import("@hmplot/jax").Array} JaxArray
 * @typedef {import("./internalTypes.js").RendererField} RendererField
 * @typedef {import("./viewControllerTypes.js").BrushResource} InteractionResource
 * @typedef {import("./markPlanTypes.js").PreparedInteraction} FeedbackBinding
 * @typedef {Pick<import("./internalTypes.js").PreparedMark, "props"> & Partial<Pick<
 *   import("./internalTypes.js").PreparedMark,
 *   "interaction" | "interactionIndex" | "connections" | "expressionOpacity" | "lifecycleOpacity" |
 *   "displayedOpacity" | "lifecycleInteraction" | "translucent">>} FeedbackPreparation
 * @typedef {{
 *   fields?: Map<string, RendererField>,
 *   ensureInteractionOpacity?(): void,
 *   setInteractionTranslucent?(translucent: boolean): void,
 * }} FeedbackMark
 */

/**
 * A new reference to an opacity array, for the op that consumes it; a constant as it is.
 * @param {JaxArray | number} value
 */
const held = (value) => (typeof value === "number" ? value : value.ref);

/**
 * Write `mark`'s feedback opacity for the displayed preparation `entry` and its interaction
 * binding, and again on each membership change of a resource it responds to, until the
 * returned stop. Returns nothing when the mark has no per-row feedback to draw.
 *
 * Interaction updates are latest-state updates: serially appending every pointer event to the
 * field's upload chain created seconds of latency during a brush. At most one upload is in
 * flight, with one dirty bit; the next pass reads the newest resource masks.
 * @param {{ kind: string, mark: FeedbackMark, entry: FeedbackPreparation | null,
 *   report: (error: unknown) => void }} target
 * @returns {(() => void) | undefined}
 */
export function startFeedbackOpacity({ kind, mark, entry, report }) {
  const binding = entry?.interaction;
  const lifecycleOpacity = entry?.lifecycleOpacity;
  const lifecycleInteraction = entry?.lifecycleInteraction;
  // Marks without row identity (literal arrays) still honor per-row opacity expressions.
  /** @type {InteractionResource[]} */
  const resources = binding?.owner ? responseResources(binding) : [];
  const hasFeedbackField = mark.fields?.has("interactionOpacity");
  const expressionOpacity = entry?.expressionOpacity;
  const displayedOpacity =
    entry?.displayedOpacity ?? expressionOpacity ?? lifecycleOpacity;
  if (
    (!resources.length &&
      !lifecycleOpacity &&
      !expressionOpacity &&
      !hasFeedbackField) ||
    !capability(kind, "rows")
  )
    return;
  mark.ensureInteractionOpacity?.();
  if (!mark.fields?.has("interactionOpacity")) return;
  let disposed = false,
    running = false,
    dirty = false;
  const write = async () => {
    while (!disposed && dirty) {
      dirty = false;
      if (
        disposed ||
        (binding?.owner &&
          binding.generation !== binding.owner.generation &&
          binding.dataScope?.revalidatedGeneration !== binding.owner.generation)
      )
        return;
      const active = resources.filter(
        (resource) => resource.active || resource.previewActive,
      );
      // Tell the mark whether any row will be translucent, so opaque rows keep coverage
      // semantics (no blending, no halos) until something is actually dimmed.
      mark.setInteractionTranslucent?.(
        entry?.translucent === true ||
          !!lifecycleOpacity ||
          (active.length > 0 && !!binding && binding.selectionOpacity < 1),
      );
      let opacity, mappedBase;
      // Lifecycle-only opacity is published with the other mark fields so an entering instance
      // can never appear before its fade buffer. Avoid immediately writing the same target
      // again and interrupting that buffered transition.
      if (!active.length && lifecycleOpacity && !expressionOpacity) return;
      let baseOpacity = displayedOpacity ?? 1;
      const sourceOpacity = displayedOpacity;
      if (sourceOpacity?.shape && capability(kind, "segmentRows")) {
        mappedBase = segmentValues(sourceOpacity.ref, kind, entry?.props);
        baseOpacity = mappedBase;
      }
      if (!active.length) opacity = mappedBase ?? displayedOpacity?.ref ?? 1;
      // Active resources are the binding's (responseResources): it and its preparation are there.
      else if (!binding || !entry) return;
      else if (
        active.length === 1 &&
        !sourceOpacity &&
        !entry.interactionIndex &&
        !lifecycleInteraction &&
        binding.scope?.identityRows &&
        !capability(kind, "segmentRows")
      ) {
        const resource = active[0],
          role = interactionRole(binding, resource);
        opacity = resource.feedbackOpacity(
          /** @type {import("./viewControllerTypes.js").InteractionOwner} */ (
            binding.owner
          ),
          binding.scope.length,
          interactionPhase(resource, role),
          binding.selectionOpacity,
          role === "nearby",
        );
      } else {
        const masks = active.map((resource) => {
          const phase = interactionPhase(
            resource,
            interactionRole(binding, resource),
          );
          // Connector indices map drawn rows to the identity owner. Series and GeoJSON
          // indices instead map to their local scope, which may reorder or filter owner rows.
          const owner = /** @type {any} */ (binding.scope)?.identity;
          let base =
            entry.connections && entry.interactionIndex && owner
              ? resource.mask(owner, owner.length, phase)
              : selectionMask(binding.scope, resource, phase);
          if (entry.interactionIndex) {
            const index = entry.interactionIndex;
            const safe = np.clip(index.ref, 0, Math.max(0, base.shape[0] - 1));
            const gathered = np.take(base.ref, safe.ref, 0);
            const mapped = np.where(index.ref.greaterEqual(0), gathered.ref, 0);
            base.dispose();
            safe.dispose();
            gathered.dispose();
            base = mapped;
          }
          if (lifecycleInteraction) {
            if (!lifecycleInteraction.sourceLength) {
              base.dispose();
              base = np.zeros([lifecycleInteraction.outputLength], {
                dtype: np.int32,
              });
            } else {
              const gathered = np.take(
                base.ref,
                lifecycleInteraction.index.ref,
                0,
              );
              const mapped = np.where(
                lifecycleInteraction.valid.ref,
                gathered.ref,
                0,
              );
              base.dispose();
              gathered.dispose();
              base = mapped;
            }
          }
          return segmentValues(base, kind, entry.props, np.int32);
        });
        let combined = masks.shift();
        for (const mask of masks) {
          const next = np.maximum(combined.ref, mask.ref);
          combined.dispose();
          mask.dispose();
          combined = next;
        }
        // Either opacity makes the displayed one, so the base is an array where they multiply.
        opacity = np.where(
          combined.ref.greater(0),
          held(baseOpacity),
          expressionOpacity || lifecycleOpacity
            ? /** @type {JaxArray} */ (baseOpacity).ref.mul(
                binding.selectionOpacity,
              )
            : binding.selectionOpacity,
        );
        // Nearby alone dims the other rows only while some row is nearby, like @any_nearby.
        if (
          combined.shape[0] &&
          active.every(
            (resource) => interactionRole(binding, resource) === "nearby",
          )
        )
          opacity = np.where(
            np.max(combined.ref).greater(0),
            opacity,
            held(baseOpacity),
          );
        combined.dispose();
      }
      // The field checked above stays registered for the mark's life (objects/base.js).
      const field = mark.fields?.get("interactionOpacity");
      if (!disposed && field) await field.update(opacity);
      opacity?.dispose?.();
      if (mappedBase && opacity !== mappedBase) mappedBase.dispose();
    }
  };
  const update = () => {
    if (disposed) return;
    dirty = true;
    if (running) return;
    running = true;
    write()
      .catch((error) => {
        if (!disposed) report(error);
      })
      .finally(() => {
        running = false;
        // An update can arrive between the loop condition and finally.
        if (!disposed && dirty) update();
      });
  };
  const stops = resources.map((resource) =>
    onMembershipChange(resource, update),
  );
  update();
  return () => {
    disposed = true;
    stops.forEach((stop) => stop());
  };
}
