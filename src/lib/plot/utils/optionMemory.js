function children(node) {
  return [...node.children.values(), ...node.dependents.values()];
}
function key(node, index) {
  return node.presentation?.label
    ? `${node.presentation.kind}:${node.presentation.label}`
    : `${node.name}:${index}`;
}
// The user layer only (TODO 136.7): authored props come back with the component, the theme and
// derived values are worked out again, so remembering them would pin stale values above both.
function capture(node) {
  return {
    values: Object.fromEntries(node.layers.get("user")),
    children: Object.fromEntries(
      children(node).map((child, i) => [key(child, i), capture(child)]),
    ),
  };
}
/** Retain only the viewer's option values and labels, never nodes, renderers, or GPU handles. */
export function rememberOptions(root, initial) {
  let alive = true,
    queued = false,
    snapshot = initial,
    restoring = false;
  const watched = new Map(),
    restored = new WeakSet();
  function scan(node, previous) {
    if (!watched.has(node))
      watched.set(node, [
        node.on(save),
        node.onChildren(schedule),
        node.onDependents(schedule),
      ]);
    if (previous && !restored.has(node)) {
      restored.add(node);
      node.populate(previous.values, { layer: "user" });
    }
    children(node).forEach((child, i) =>
      scan(child, previous?.children?.[key(child, i)]),
    );
  }
  function save() {
    if (alive && !restoring) snapshot = capture(root);
  }
  function schedule() {
    if (queued || !alive) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!alive) return;
      restoring = true;
      try {
        scan(root, initial);
      } finally {
        restoring = false;
      }
      save();
    });
  }
  schedule();
  return {
    get snapshot() {
      return snapshot ?? capture(root);
    },
    dispose() {
      alive = false;
      for (const unsub of watched.values()) unsub.forEach((f) => f());
      watched.clear();
    },
  };
}
