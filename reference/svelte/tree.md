# Tree

A rooted tree layout of an edge table, as a tidy tree, an icicle or a dendrogram.

## Example

```svelte
<script>
  import {
    Plot,
    Tree,
    Edges,
    Nodes,
    Segments,
    Points,
    GraphData,
  } from "hmplot";
  const data = {
    source: ["root", "root", "a", "a", "b"],
    target: ["a", "b", "a1", "a2", "b1"],
  };
</script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><Tree root="root">
      <Edges><Segments start="start" end="end" /></Edges>
      <Nodes><Points position="position" /></Nodes>
    </Tree></GraphData
  >
</Plot>
```

## Options

- `root` (`string | number | boolean | expression`): The starting node's ID, or a scalar reduction over node columns and selection. Its depth is zero; every mode keeps only reachable nodes.
- `directed` (`boolean`): Follows edges only from source to target, instead of both ways, in every mode. Default: `false`.
- `orientation` (`"left" | "right" | "down" | "up"`): The direction the tree grows from its root. Default: `"down"`.
- `siblingSpacing` (`number`): The distance between neighboring leaves, across the tree (tidy and cluster modes). Default: `1` data units.
- `depthSpacing` (`number`): The distance between levels, along the tree (tidy and cluster modes). Default: `1` data units.
- `mode` (`"tidy" | "tidy-approx" | "partition" | "cluster"`): A compact CPU tidy tree, a GPU approximation reserving subtree intervals (tidy-approx), a GPU icicle of nested rectangles with x0, x1, y0 and y1 (partition), or a dendrogram with every leaf on one level (cluster). Every mode gives the leaves an order column, their place from left to right. Default: `"tidy"`.
- `layerHeight` (`number | column | expression`): Partition mode: nonnegative band thickness per node. Children start at their parent's end; zero collapses a layer. tween() runs before layout. Default: `1` data units.
- `nodeWidth` (`number | column | expression`): Each node's width, as a number or a nodes-table column or expression. Partition and tidy modes allow zero widths for collapsing branches; incoming tween() is evaluated before geometry. Default: `1` data units.
- `childAlign` (`"left" | "right" | "center"`): Partition mode with widthMode "fixed": where the children sit in a parent wider than they are. Default: `"center"`.
- `widthMode` (`"proportional" | "fixed"`): Partition mode: a parent spans its children's total width (proportional), or at least its own nodeWidth (fixed). Default: `"proportional"`.
- `visualMargin` (`number`): Partition mode: a gap between neighboring rectangles, inset from each node's bounds without moving its center. Default: `0` data units.
- `height` (`column | expression`): Cluster mode: a nodes-table column of merge heights, which places each node that far from the leaves, drawn to scale as scipy's dendrogram does.
- `edgeLength` (`number | column | expression`): Tidy modes: nonnegative incoming edge lengths read from the edge table, accumulated along root paths and multiplied by depthSpacing. Default: `1`.
- `where` (`boolean | column | expression`): Node-table predicate; hidden nodes disconnect descendants. The root remains present. Layout entry/exit retains departing branches until they shrink.
- `enter` (`{ nodeWidth?: number; layerHeight?: number; edgeLength?: number }`): Starting numeric contributions for entering branches. Omitted endpoints are zero; initial mounting rests at the target.
- `exit` (`{ nodeWidth?: number; layerHeight?: number; edgeLength?: number }`): Departing branch contributions, reached before removal. Omitted endpoints are zero.
- `animationDuration` (`number`): Duration of layout-owned entry and exit; incoming tweens keep their own timing. Default: `300` ms.
- `animationEasing` (`"linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out"`): Easing of layout-owned entry and exit. Default: `"cubic-in-out"`.
- `name` (`string`): The layout's name in the status its handle reports.

## Usage

Provides Nodes and Edges scopes with parent, depth, degree, order, positions, and endpoints. Drops unreachable nodes and non-tree edges. Default traversal is undirected, orientation down, and spacing 1. directed follows source-to-target edges. A missing root is an error.

All modes honor `directed`: true follows outgoing edges and shows a subtree, false traverses either way and reroots the reachable component. The root has depth zero, and Edges publish the child node's `depth`, even when an original edge points toward the root. Explicit node tables retain selection and keyed animation identity while unreachable nodes are omitted. Automatic bounds update when layout geometry changes; explicit domains remain fixed.

Nodes also publish `parentPosition`, `parentX` and `parentY`, plus `parentX0`/`parentX1`/`parentY0`/`parentY1` in partition mode. Roots have NaN parent coordinates. These support enter/exit animation: `x={animate(col.x, {enter: col.parentX, exit: col.parentX})}`. New rows read their new parent's coordinates; departing rows read their previous parent's coordinates.

`root` can be a scalar reduction expression over the original node table, including its selection. See [Zoomable sunburst](/HMPlot/examples/sunburst.md) for declarative focus and [Expandable tree](/HMPlot/examples/expandable-tree.md) for collapse, depth filtering and layout-owned transitions.

In `mode="partition"`, `visualMargin` insets the published node bounds to create visible gaps between sibling rectangles and depth bands. It defaults to zero, and the node `x`/`y` centers stay fixed.

Every mode publishes `order` on its nodes: each leaf's place among the leaves, left to right (0, 1, 2, ...), and NaN for inner nodes, so marks placed by it skip them. A nodes table may not have its own `order` column.

Requires graph data from GraphData. Outputs are visible to children only. Transforms retain the previous complete result while an update prepares. To let the viewer change a setting, read an input in it: `orientation={input("orientation")}` (Python `orientation=hm.input.orientation`), where `orientation` is a [Select](select) of `"down"`, `"up"`, `"left"` and `"right"`.

## Dendrograms

Partition widths and heights can be zero. `layerHeight` accepts a number, node-table column or expression, with each child's band starting at its parent's end. `tween()` in `nodeWidth` and `layerHeight` runs **before** layout on the plot clock. With a stable topology, tweening unwanted subtree weights and ancestor heights to zero shrinks them coherently; restoring the values grows them. Filter zero-area nodes after layout and draw the moving geometry directly, without another mark transition. See [Zoomable sunburst](/HMPlot/examples/sunburst.md).

`mode="cluster"` lays a tree out as d3.cluster does: every leaf at the same level, one `siblingSpacing` apart in `order` (leaf k at k), and each parent centered over its children (their mean). The leaves sit at 0 along the tree and the root at the far end. Without `height`, a node sits 1 + its tallest child from the leaves (times `depthSpacing`). With `height`, a column of the nodes table (or an expression over it), each node sits at its merge height, drawn to scale as scipy's dendrogram draws it: y is the height in `"down"`, -height in `"up"`, x is the height in `"left"` and -height in `"right"`. Leaves take height 0 (a missing value reads as 0); a merge needs a finite height, at least its children's, and Tree names the node otherwise. Only nodes reachable from the root are published.

Draw the links with Segments and a step curve for right-angle elbows: `curve="step-after"` (across, then along) for `"down"` and `"up"`, and `curve="step-before"` for `"left"` and `"right"`. In a polar Plot or Frame, `"up"` with `step-after` draws arcs, then radial lines; a `baseRadius` equal to the root's height puts the root at the center.

A clustered heatmap sorts its rows (or columns) in the order of the leaves, one unit per leaf, and puts each dendrogram in a Frame beside it whose leaf axis has the domain [-0.5, n - 0.5] over the heatmap's n rows, so leaf k sits at the center of row k. Nodes can label the leaves with `y="order"` (or `x="order"`).

Tree takes precomputed trees; it does not cluster. In Python, `hm.linkage_table(Z, labels)` turns a scipy linkage matrix into the tables below, and `scipy.cluster.hierarchy.leaves_list(Z)` is the leaf order. In JavaScript, turn merge rows `[a, b, height]` (scipy's convention: leaves 0 to n - 1, merge i makes node n + i) into an edge table and a nodes table:

```js
function linkageTable(merges, labels) {
  const n = labels.length, edges = { source: [], target: [] };
  const nodes = { id: labels.map((_, i) => i), label: [...labels], height: labels.map(() => 0) };
  merges.forEach(([a, b, height], i) => {
    edges.source.push(n + i, n + i); edges.target.push(a, b);
    nodes.id.push(n + i); nodes.label.push(null); nodes.height.push(height);
  });
  // The leaves left to right, as mode="cluster" places them (its order column).
  const leaves = [], stack = [2 * n - 2];
  while (stack.length) {
    const node = stack.pop();
    if (node < n) leaves.push(node); else stack.push(merges[node - n][1], merges[node - n][0]);
  }
  return { edges, nodes, root: 2 * n - 2, leaves };
}
```

```svelte
<GraphData nodes={rows.nodes} edges={rows.edges}>
  <Tree root={rows.root}
    mode="cluster" height="height" orientation="down">
    <Edges><Segments start="start" end="end" curve="step-after" /></Edges>
  </Tree>
</GraphData>
```

A d3 hierarchy converts the same way: `root.links()` lists each parent with its children, in order, for the edge table, and the nodes table takes each node's merge height from its data.

See the [complete example](/HMPlot/examples/clustermap.md).

## Tree layout animation

Tree offers compact CPU `tidy`, GPU `tidy-approx` (horizontal intervals per subtree),
GPU `partition`, and CPU `cluster`. GPU modes cache topology by node IDs/order, source/target
columns, root and direction. Width/height changes reuse structural buffers. Partition uses
leaf prefix sums; root-path accumulation uses logarithmic pointer-jumping passes. Approximate
and fixed-width subtree sizing uses ordered depth passes, so very deep trees cost more.
CPU tidy can consume moving inputs too, but reads numeric values and lays out on the host.

`edgeLength` (Python `edge_length`) reads a nonnegative edge-table column or expression.
Tidy modes accumulate lengths along root paths, multiplied by `depthSpacing`; siblings can
have unequal lengths. Partition uses per-node `layerHeight`; cluster uses merge heights.

Put visibility on Tree's `where`, not a Filter after Nodes, when branches should reflow.
It reads the node table and disconnects descendants of hidden nodes; the root remains present.
Tree's `enter` and `exit` specify nonnegative numeric `nodeWidth`, `layerHeight`, and
`edgeLength` contributions (omitted endpoints are zero). `animationDuration` and
`animationEasing` control these lifecycle transitions. Initial mounting rests at the target.
In Python, nested keys are `node_width`, `layer_height`, and `edge_length`.

Departing nodes and edges remain until their contributions land; new rows start at enter
values. Interrupted membership transitions continue from their current contribution.
`presence` on Nodes and Edges ranges from zero to one, so `opacity="presence"` fades marks
with their branch. Incoming `tween()` expressions remain ordinary numeric inputs with their
own timing; they do not declare layout entry/exit. Draw moving geometry directly without
another mark animation or bounds animation. Cluster does not support layout lifecycle.
Changing the root or reparenting a surviving node switches topology discretely; it does not
retain both parents. Use a fixed root with tweened weights/heights for continuous zoom, as in
the sunburst example. Structural changes may compile a new GPU plan.

Source validation and membership updates may read data once; GPU numeric layout does not
read coordinates back each frame. Rendering, bounds, picking and export retain their existing
readbacks. See [Expandable tree](/HMPlot/examples/expandable-tree.md) and [Sunburst](/HMPlot/examples/sunburst.md).

## Related examples

- [Rooted tree](/HMPlot/examples/rooted-tree.md)
- [Tree icicle](/HMPlot/examples/tree-icicle.md)
- [Clustered heatmap](/HMPlot/examples/clustermap.md)
