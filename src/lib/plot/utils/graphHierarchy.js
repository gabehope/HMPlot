/** Validate a graphStructure's indexed edges and expose the hierarchy to layout authors.
 * The graph owner has already validated endpoints and unique node keys. An omitted root
 * selects the unique parentless node; built-in layouts pass their explicitly chosen root.
 * Iteration keeps deep hierarchies independent of the JavaScript call-stack limit.
 */
export function graphHierarchy({ ids, from, to }, { root, owner = "Layout", signal } = {}) {
  const check = () => {
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  };
  check();
  const children = Array.from({ length: ids.length }, () => []);
  const parent = Array(ids.length).fill(-1), depth = Array(ids.length).fill(0);
  const degree = Array(ids.length).fill(0);
  for (let row = 0; row < from.length; row++) {
    check();
    const source = from[row], target = to[row];
    if (source === target) throw Error(`${owner} requires an acyclic hierarchy.`);
    if (parent[target] >= 0) throw Error(`${owner} requires one parent per node.`);
    parent[target] = source;
    children[source].push(target);
    degree[source]++;
    degree[target]++;
  }
  if (root === undefined) {
    const roots = parent.flatMap((value, index) => value < 0 ? [index] : []);
    if (!roots.length && ids.length) throw Error(`${owner} requires an acyclic hierarchy.`);
    if (roots.length !== 1) throw Error(`${owner} requires a connected hierarchy with one root.`);
    root = roots[0];
  }
  if (!Number.isInteger(root) || root < 0 || root >= ids.length)
    throw Error(`${owner} root is not present.`);
  if (parent[root] >= 0) throw Error(`${owner} root must have no parent.`);
  const pending = [root];
  let count = 0;
  while (pending.length) {
    check();
    const index = pending.pop();
    count++;
    for (const child of children[index]) {
      depth[child] = depth[index] + 1;
      pending.push(child);
    }
  }
  // With one parent per node and a parentless root, reachable nodes cannot cycle.
  if (count !== ids.length) throw Error(`${owner} requires a connected hierarchy.`);
  return { root, parent, depth, children, degree };
}
