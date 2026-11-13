/**
 * Synchronizes Partition's sibling settings trees; this does not link data scopes. Partition
 * owns the synchronizer and removes each group's subscriptions before disposing its tree.
 * It mounts the same authored children once per group, so each group gets its own scope;
 * an edit to any one of them applies to
 * the matching node in every other group ("edit once, applies to all groups"). Nodes are
 * matched by their position in the subtree — dependent identifier or child name — which is
 * stable because every group mounts the same components in the same order. Options named by
 * `local` stay per group: Partition keeps `visible` local while legendGroups gives each group
 * its own legend entry, so hiding one entry hides one group.
 */
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
// What a group shares: the viewer's edits and the authored values, each in its own layer. The
// theme and derived values (a scale's options, a datetime axis) each group works out itself
// (TODO 136.7); copied, they would sit above and outlive the other group's own.
const SHARED = ["user", "authored"];
function* shared(node) {
  for (const layer of SHARED)
    for (const [option, value] of node.layers.get(layer))
      yield [layer, option, value];
}

function descend(root, path) {
  let node = root;
  for (const part of path) {
    const [kind, id] = [part.slice(0, 1), part.slice(2)];
    node =
      kind === "c"
        ? node.hasChild(id)
          ? node.child(id)
          : null
        : node.dependents.get(id);
    if (!node || node.isDisposed) return null;
  }
  return node;
}

export function createPartitionSettingsSync({ local = () => [] } = {}) {
  const roots = new Map(),
    stops = new Map(),
    attached = new Map(),
    snapshots = new Map();
  let applying = false,
    disposed = false;
  const isLocal = (option) => {
    for (const name of local()) if (name === option) return true;
    return false;
  };
  function propagate(key, path, node) {
    if (applying || disposed) return;
    const id = path.join("/"),
      seen = snapshots.get(key).get(id) ?? new Map();
    for (const [layer, option, value] of shared(node)) {
      const entry = `${layer}:${option}`;
      if (seen.has(entry) && same(seen.get(entry), value)) continue;
      seen.set(entry, value);
      if (isLocal(option)) continue;
      applying = true;
      try {
        for (const [otherKey, otherRoot] of roots) {
          if (otherKey === key) continue;
          const target = descend(otherRoot, path);
          if (!target?.has(option)) continue;
          target.set(option, value, { layer });
          snapshots.get(otherKey).get(id)?.set(entry, value);
        }
      } finally {
        applying = false;
      }
    }
    snapshots.get(key).set(id, seen);
  }
  function attach(key, node, path) {
    const set = attached.get(key);
    if (disposed || node.isDisposed || set.has(node)) return;
    set.add(node);
    const id = path.join("/");
    // A newly mounted group adopts whatever the other groups already show.
    const values = new Map();
    for (const [other, root] of roots) {
      if (other === key) continue;
      const source = descend(root, path);
      if (!source) continue;
      applying = true;
      try {
        for (const [layer, option, value] of shared(source))
          if (node.has(option) && !isLocal(option)) {
            node.set(option, value, { layer });
            values.set(`${layer}:${option}`, value);
          }
      } finally {
        applying = false;
      }
      break;
    }
    for (const [layer, option, value] of shared(node))
      if (!values.has(`${layer}:${option}`))
        values.set(`${layer}:${option}`, value);
    snapshots.get(key).set(id, values);
    const rescan = () => {
      for (const [name, child] of node.children)
        attach(key, child, [...path, `c:${name}`]);
      for (const [identifier, dependent] of node.dependents)
        attach(key, dependent, [...path, `d:${identifier}`]);
    };
    stops.get(key).push(
      node.on(() => propagate(key, path, node)),
      node.onChildren(rescan),
      node.onDependents(rescan),
    );
    rescan();
  }
  return {
    /** Borrow a group's settings root and subscribe to its subtree as children mount. */
    add(key, root) {
      if (disposed || roots.has(key)) return;
      roots.set(key, root);
      stops.set(key, []);
      attached.set(key, new Set());
      snapshots.set(key, new Map());
      attach(key, root, []);
    },
    remove(key) {
      stops.get(key)?.forEach((stop) => stop());
      stops.delete(key);
      roots.delete(key);
      attached.delete(key);
      snapshots.delete(key);
    },
    get size() {
      return roots.size;
    },
    dispose() {
      disposed = true;
      for (const key of [...roots.keys()]) this.remove(key);
    },
  };
}
