// @ts-check
import { onDestroy, untrack } from "svelte";

/**
 * A component's status channel (TransformStatus: kind, pending, error, mounted, and any extras
 * `read` adds), for the `subscribe` its handle exports. Call it while the component initializes.
 * subscribe() delivers the current status at once and then every change; when the component is
 * destroyed, listeners get a last status with mounted and pending false, and are released.
 * `whenSettled` and the readiness of the work stay with the component.
 * @param {() => import("../publicTypes.js").TransformStatus} read
 */
export function statusChannel(read) {
  /** @type {Set<(status: import("../publicTypes.js").TransformStatus) => void>} */
  const listeners = new Set();
  $effect(() => {
    const next = read();
    untrack(() => {
      for (const listener of listeners) listener(next);
    });
  });
  onDestroy(() => {
    const last = { ...untrack(read), pending: false, mounted: false };
    for (const listener of listeners) listener(last);
    listeners.clear();
  });
  return {
    /** @param {(status: import("../publicTypes.js").TransformStatus) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      listener(untrack(read));
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
