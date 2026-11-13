// @ts-check
// What an HTML export keeps of a scene state (Stage 115.3). python/hmplot/exporter.py's _closure
// is the same traversal; tests/unit/fixtures/export-closure.json holds the cases both agree on.

const RESOURCES = /** @type {const} */ ({
  table: "tables",
  column: "columns",
  scale: "scales",
  normalization: "normalizations",
  theme: "themes",
  selection: "selections",
  identity: "identities",
});

/**
 * @typedef {(typeof RESOURCES)[keyof typeof RESOURCES]} ResourceCollection
 * @typedef {{ id: string, kind: string, props: Record<string, unknown>, events?: string[],
 *   children: SceneStateNode[] }} SceneStateNode A component of a scene state (python/PROTOCOL.md).
 * @typedef {{ root: SceneStateNode }
 *   & { [name in ResourceCollection]?: Record<string, Record<string, unknown>> }} SceneState
 *   A scene state: its component tree, and each collection's resource descriptors by id.
 */

/**
 * The part of `source` (a scene state) an HTML export of `target` keeps: the target's subtree
 * (the whole scene for its root) without callbacks, and the resources it references, and theirs:
 * a table's columns, grid and interaction resources, an identity's key column and resources, a
 * scale's normalization. A target referencing a component outside its subtree is refused.
 * `visit(node, omitted)` lets the browser write what it shows into each kept node before its
 * references are read. Returns { state, omitted }, with `state` a copy.
 * @param {SceneState} source
 * @param {string} [target] A component's id.
 * @param {{ visit?: (node: SceneStateNode, omitted: string[]) => void }} [options]
 * @returns {{ state: SceneState, omitted: string[] }}
 */
export function exportClosure(source, target = source.root.id, { visit } = {}) {
  const state = structuredClone(source);
  /** @type {string[]} */
  const omitted = [];
  /** @type {Set<unknown>} */
  const ids = new Set();
  // The ids each `$kind` reference names, by kind (a reference's id is whatever the state holds).
  const refs = Object.fromEntries(
    Object.keys(RESOURCES).map((kind) => [kind, new Set()]),
  );
  /**
   * @param {SceneStateNode} node
   * @returns {SceneStateNode | null}
   */
  const keep = (node) => {
    if (target === state.root.id || node.id === target) return node;
    const children = node.children.map(keep).filter((child) => child !== null);
    if (!children.length) return null;
    node.children = children;
    return node;
  };
  if (target !== state.root.id) {
    const root = keep(state.root);
    if (!root) throw Error("The HTML export target is no longer mounted.");
    state.root = root;
  }
  /** @param {unknown} value */
  const scan = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(scan);
    for (const [key, item] of Object.entries(value)) {
      if (key[0] === "$" && Object.hasOwn(refs, key.slice(1)))
        refs[key.slice(1)].add(item);
      else scan(item);
    }
  };
  /** @param {SceneStateNode} node */
  const clean = (node) => {
    ids.add(node.id);
    if (node.events?.length)
      omitted.push(...node.events.map((event) => `${node.kind}.${event}`));
    node.events = [];
    visit?.(node, omitted);
    scan(node.props);
    node.children.forEach(clean);
  };
  clean(state.root);
  /** @type {Set<unknown>} */
  const nodeRefs = new Set();
  /** @param {unknown} value */
  const scanNodeRefs = (value) => {
    if (!value || typeof value !== "object") return;
    if ("$ref" in value && value.$ref) nodeRefs.add(value.$ref);
    Object.values(value).forEach(scanNodeRefs);
  };
  scanNodeRefs(state.root);
  if ([...nodeRefs].some((id) => !ids.has(id)))
    throw Error(
      "This target references a component outside its subtree; export the containing Scene instead.",
    );
  // Kept tables, identities and scales reference further resources: read each once, until
  // nothing new is kept. A table's `key` names a column, not a resource.
  const read = { table: new Set(), identity: new Set(), scale: new Set() };
  // Object.keys types its keys as strings; these are `read`'s own literal keys.
  const readKinds = /** @type {(keyof typeof read)[]} */ (Object.keys(read));
  for (let grew = true; grew;) {
    grew = false;
    for (const kind of readKinds)
      for (const id of [...refs[kind]]) {
        if (read[kind].has(id)) continue;
        read[kind].add(id);
        grew = true;
        // An id indexes its collection as a property key, as the reference holds it.
        const descriptor = state[RESOURCES[kind]]?.[String(id)];
        if (!descriptor) continue;
        const { key, ...references } = descriptor;
        scan(kind === "table" ? references : descriptor);
      }
  }
  for (const [kind, name] of Object.entries(RESOURCES))
    state[name] = Object.fromEntries(
      Object.entries(state[name] ?? {}).filter(([id]) => refs[kind].has(id)),
    );
  return { state, omitted };
}
