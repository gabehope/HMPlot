// @ts-check
/** One registry of field upload managers. Settlement waits for their existing work, geometry
 * publication and submitted GPU commands; managers remain the owners of their buffers. */
/** @typedef {import('../utils/proputils.js').BufferManager} UploadManager */
/** @type {WeakMap<object, Set<UploadManager>>} */
const managers = new WeakMap();
/** @param {UploadManager} manager */
export function registerManager(manager) {
  const renderer = manager.renderer;
  let registered = managers.get(renderer);
  if (!registered) managers.set(renderer, (registered = new Set()));
  registered.add(manager);
  return () => registered.delete(manager);
}
/**
 * @param {import('../utils/internalTypes.js').PlotRenderer | undefined} renderer
 * @param {import('../utils/internalTypes.js').ViewLifecycle | undefined} lifecycle
 */
export async function settleRendererUploads(renderer, lifecycle) {
  await Promise.all(
    [...registeredManagers(renderer)].map((manager) => manager.chain),
  );
  await lifecycle?.geometryQueue;
  // Three's base Backend declaration omits the WebGPU subclass's device. The renderer
  // can also use a backend without one, in which case there is no GPU queue to drain.
  const backend = /** @type {{device?: GPUDevice} | undefined} */ (
    renderer?.backend
  );
  await backend?.device?.queue.onSubmittedWorkDone();
}
/**
 * Wait for the view's queued field uploads, its curved-path geometry and its submitted GPU work.
 * @param {import("../utils/internalTypes.js").ViewServices | undefined} view
 */
export const settleUploads = (view) =>
  settleRendererUploads(view?.renderer, view?.lifecycle);

/** @type {ReadonlySet<UploadManager>} */
const emptyManagers = new Set();
/** Borrow the registry for diagnostics; the caller must not mutate its membership.
 * @param {object | undefined} renderer
 * @returns {ReadonlySet<UploadManager>}
 */
export const registeredManagers = (renderer) =>
  (renderer && managers.get(renderer)) || emptyManagers;
