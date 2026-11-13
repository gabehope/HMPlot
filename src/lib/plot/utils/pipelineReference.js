// Explicit references to a live pipeline output (TODO 142.3): a transform component's handle
// (bind:this in Svelte; a Python transform node, which a scene resolves to its mounted handle,
// "$ref") read where a Data value or a Join's data goes. The handle's dataSource() is the same
// provider its children read through context (transform.svelte), so a reference shares the
// output's computation and buffers with them; it is never a copy or a host snapshot.

/** Whether `value` is a reference to a pipeline output (a transform's handle). */
/** @param {unknown} value */
export const isPipelineReference = (value) =>
  typeof (/** @type {{dataSource?: unknown}} */ (value)?.dataSource) === "function";

/**
 * The live source a reference names: `{read(), current(), domainSource(), adopt(view), kind,
 * definition}`, or null while its transform has not mounted its output provider. `owner` names
 * the reader in errors.
 * @param {any} reference @param {string} owner
 */
export function pipelineSource(reference, owner) {
  const source = reference.dataSource();
  if (source && (typeof source.read !== "function" || typeof source.current !== "function"))
    throw Error(`${owner}: a reference names a transform's output (a Filter, Group, Calculate, ...); this component has none.`);
  return source ?? null;
}
