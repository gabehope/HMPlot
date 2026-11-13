import { evaluateTransientExpression } from "./expressionPlans.js";
import { isExpression } from "./expressions.js";
import { hierarchy, pack, treemap, treemapBinary, treemapDice, treemapSlice, treemapSliceDice, treemapSquarify, treemapResquarify } from 'd3';
import { numpy as np } from '@hmplot/jax';
import { publishLayout } from './layoutPublication.js';

import { graphData, hostColumn } from './graphData.js';
import { graphHierarchy } from './graphHierarchy.js';

const check = signal => { if (signal?.aborted) throw new DOMException('Canceled', 'AbortError'); };

async function layout(scope, config, kind, { signal, evaluator } = {}) {
  const graph = await graphData(scope, { ...config, name: kind }, { signal });
  const owned = [], own = value => (owned.push(value), value);
  try {
    if (kind === 'Pack' && graph.fields.r !== undefined) throw Error('Pack writes each node\'s radius as r: rename the node table\'s column r.');
    if (kind !== 'Pack' && graph.fields.total !== undefined) throw Error('Treemap writes each node\'s summed value as total: rename the node table\'s column total.');
    if (kind === 'Pack' && graph.fields.total !== undefined) throw Error('Pack writes each node\'s summed value as total: rename the node table\'s column total.');
    const { ids, from, to } = graph;
    if (isExpression(config.root))
      throw Error(`${kind} root takes a node's ID, or input("name") for one a control or a click sets.`);
    // No root: the hierarchy's own (graphHierarchy finds the one parentless node).
    const rootIndex = config.root == null ? undefined : ids.indexOf(config.root);
    if (rootIndex !== undefined && rootIndex < 0) throw Error(`${kind} root is not present.`);
    const levels = config.levels;
    if (levels !== undefined && levels !== null && !(Number.isInteger(levels) && levels >= 1))
      throw Error(`${kind} levels must be a whole number of levels below root, 1 or more.`);
    const width = config.width ?? 1, height = config.height ?? 1, padding = config.padding ?? 0;
    if (![width, height].every(value => Number.isFinite(value) && value > 0))
      throw Error(`${kind} width and height must be positive and finite.`);
    if (!Number.isFinite(padding) || padding < 0) throw Error(`${kind} padding must be finite and nonnegative.`);

    // The whole hierarchy is checked (one root, one parent per node, connected); the layout
    // divides the subtree of `root`, which may be any node (TODO 145.3: a drill-down sets it).
    const { root: hierarchyRoot, children, parent: parents, degree } = graphHierarchy(graph, { owner: kind, signal });
    const rootAt = rootIndex ?? hierarchyRoot;

    let weights = ids.map(() => 1);
    if (config.value !== undefined) {
      const expression = evaluateTransientExpression(config.value, graph.nodeScope, { rowCount: ids.length, evaluator });
      try { weights = await hostColumn(expression.value); } finally { expression.dispose(); }
    }
    if (weights.some(value => !Number.isFinite(value) || value < 0))
      throw Error(`${kind} node values must be finite and nonnegative.`);
    const root = hierarchy({ index: rootAt }, node => children[node.index].map(index => ({ index })))
      .sum(node => children[node.index].length ? 0 : weights[node.index]);
    if (!(root.value > 0)) throw Error(`${kind} needs a positive total leaf value.`);
    root.sort((a, b) => b.value - a.value || a.data.index - b.data.index);

    if (kind === 'Pack') {
      pack().size([width, height]).padding(padding)(root);
    } else {
      const inner = config.paddingInner ?? padding, outer = config.paddingOuter ?? padding;
      if (![inner, outer].every(value => Number.isFinite(value) && value >= 0))
        throw Error('Treemap paddingInner and paddingOuter must be finite and nonnegative.');
      const tiles = { squarify: treemapSquarify, resquarify: treemapResquarify,
        binary: treemapBinary, slice: treemapSlice, dice: treemapDice, sliceDice: treemapSliceDice };
      const tile = tiles[config.tile ?? 'squarify'];
      if (!tile) throw Error('Treemap tile must be squarify, resquarify, binary, slice, dice, or sliceDice.');
      treemap().size([width, height]).tile(tile).paddingInner(inner).paddingOuter(outer)(root);
    }
    check(signal);
    // Not Array(n): a node outside root's subtree is undefined, not a hole that map() skips.
    const laid = Array.from({ length: ids.length }, () => undefined);
    root.each(node => { laid[node.data.index] = node; });
    // Shown: the subtree of root, or with levels that many levels below it (root itself left
    // out: its rectangle is the whole area). Other nodes stay rows of the table, hidden.
    const shown = laid.map(node => node !== undefined && (levels == null || (node.depth >= 1 && node.depth <= levels)));
    const x = [], y = [], x0 = [], x1 = [], y0 = [], y1 = [], r = [];
    for (const node of laid) {
      if (node === undefined) {
        x.push(NaN); y.push(NaN); x0.push(NaN); x1.push(NaN); y0.push(NaN); y1.push(NaN);
        if (kind === 'Pack') r.push(NaN);
        continue;
      }
      if (kind === 'Pack') {
        x.push(node.x); y.push(node.y); r.push(node.r);
        x0.push(node.x - node.r); x1.push(node.x + node.r);
        y0.push(node.y - node.r); y1.push(node.y + node.r);
      } else {
        x.push((node.x0 + node.x1) / 2); y.push((node.y0 + node.y1) / 2);
        x0.push(node.x0); x1.push(node.x1); y0.push(node.y0); y1.push(node.y1);
      }
    }
    const column = values => own(np.array(values));
    const parent = ids.some(id => typeof id !== 'number')
      ? { codes: column(parents), categories: ids }
      : column(parents.map(index => index < 0 ? -1 : ids[index]));
    return publishLayout(scope, graph, {
      nodeColumns: {
        position: column(x.map((value, index) => [value, y[index]])), x: column(x), y: column(y),
        x0: column(x0), x1: column(x1), y0: column(y0), y1: column(y1),
        ...(kind === 'Pack' ? { r: column(r) } : {}),
        parent, depth: column(laid.map(node => node?.depth ?? -1)), degree: column(degree),
        total: column(laid.map(node => node?.value ?? NaN)),
      },
      edgeColumns: {
        start: column(Array.from(from, index => [x[index], y[index]])),
        end: column(Array.from(to, index => [x[index], y[index]])),
      },
      nodeFields: ['position', 'x', 'y', 'x0', 'x1', 'y0', 'y1', 'total', ...(kind === 'Pack' ? ['r'] : [])],
      edgeFields: ['start', 'end'],
      owned,
      ...(shown.every(Boolean) ? {} : {
        nodeShown: shown,
        edgeShown: Array.from(from, (source, edge) => shown[source] && shown[to[edge]]),
      }),
    });
  } catch (error) {
    owned.forEach(value => value.dispose()); graph.dispose(); throw error;
  }
}

export const packLayout = (scope, config, options) => layout(scope, config, 'Pack', options);
export const treemapLayout = (scope, config, options) => layout(scope, config, 'Treemap', options);
