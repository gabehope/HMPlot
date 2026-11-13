/**
 * Three r183 caches bind groups by their textures, without including storage-buffer identity.
 * A growing field can therefore refresh its storage node but recover a group holding the
 * retired GPU buffer. Refresh mixed/storage groups directly; shader and pipeline caches stay
 * intact, and Three still calls updateBindings only when a resource binding changes.
 */
export function installStorageBindings(renderer) {
  const backend = renderer.backend;
  if (!backend?.isWebGPUBackend) return;
  const update = backend.updateBindings;
  backend.updateBindings = function (group, bindings, cacheIndex, version) {
    const storage = group.bindings.some((binding) => binding.isStorageBuffer);
    return update.call(this, group, bindings, storage ? 0 : cacheIndex, version);
  };
}
