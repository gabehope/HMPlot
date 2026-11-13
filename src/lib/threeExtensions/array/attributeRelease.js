/**
 * Release a GPU attribute and its Three.js tracking entry together. Field/geometry owners
 * call this at replacement or teardown; it neither owns the renderer nor waits for its work.
 * The caller owns the timing of replacement/teardown; this helper adds no submission fence.
 */
export function releaseAttribute(renderer, attribute) {
  if (!attribute) return;
  const storage = attribute.isInterleavedBufferAttribute
    ? attribute.data
    : attribute;
  // Calling backend.destroyAttribute alone leaves Attributes' version cache
  // alive, causing a second destroy during geometry/renderer teardown.
  renderer._attributes?.data?.delete(attribute);
  const backend = renderer.backend;
  if (backend?.has(storage) && backend.get(storage).buffer)
    backend.destroyAttribute(attribute);
  else if (backend?.has(attribute)) backend.delete(attribute);
}
