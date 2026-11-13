// @ts-check
/**
 * Disposal of prepared computation results, shared by namedMark and displayedFrames.
 * Delayed retirement waits for consumers; replaceableRelease instead owns a single retained
 * reference inside an entry. Neither operation owns field buffers or selects publications.
 */
import { tick } from "svelte";
import { settleUploads } from "../rendering/uploadSettlement.js";

/**
 * Retire a mark's computation result only after Svelte queues its consumers and their writes
 * finish. The entry owns arrays/scopes; BufferedField remains the owner of renderer buffers.
 * @param {import('../utils/internalTypes.js').ViewServices} view The view drawing the entry.
 * @param {{dispose(): void} | null | undefined} entry
 */
export function retirePrepared(view, entry) {
  if (!entry) return;
  return tick()
    .then(() => settleUploads(view))
    .finally(() => entry.dispose());
}

/**
 * The one owner of a preparation's changing retained reference (a live write's newest scope,
 * Stage 118.3): each replace() holds the new release and runs the previous one, and the entry's
 * disposal runs the last. A release handed in after that disposal runs at once.
 * @param {{ own(release: () => void): void }} entry
 */
export function replaceableRelease(entry) {
  /** @type {(() => void) | null} */
  let held = null;
  let disposed = false;
  entry.own(() => {
    disposed = true;
    const last = held;
    held = null;
    last?.();
  });
  return {
    /** @param {(() => void) | null | undefined} release */
    replace(release) {
      if (disposed) {
        release?.();
        return;
      }
      const previous = held;
      held = release ?? null;
      previous?.();
    },
  };
}
