# Mappings, labels, curves, polar charts, and graph views

`Mapping` supplies named channels and appearance to descendants. Explicit mark props win; inner mappings override outer mappings. Fields resolve in each consuming mark's Data scope. `Group` continues to aggregate data. Mapping does not supply callbacks, names, or structural references.

```svelte
<Plot data={observations}>
  <Mapping x="length" y="width" fill="species">
    <Points size={4} />
    <Text text="name" dx={8} align="left" size={14} />
  </Mapping>
</Plot>
```

`Text` renders a batch using shared GPU text atlases. Positions and numeric styles remain GPU-resident. Size and offsets are CSS pixels and remain stable during zoom; offsets are positive right/down. Text accepts host strings/numbers and `{codes, categories}` GPU dictionaries. Convert arbitrary numeric GPU columns explicitly before formatting them as text. No automatic label placement is performed. Use Text3D for text as geometry in data units, with `tex` for TeX math.

`Arrows`, from `hmplot/charts`, connects `start` and `end` through Segments with `cap="arrow"`, with pixel-sized width and head dimensions (defaults 2, 10, and 8). Its heads face the camera; `Arrows3D` draws solid geometry in world units. Both use the same adaptive curve engine as lines.

## Curves

Line supports `linear`, `step`, `step-before`, `step-after`, `monotone-x`, `monotone-y`, `catmull-rom`, and `basis`. `curveAlpha` defaults to 0.5 for Catmull–Rom. Independent Segments and arrows support linear/step curves, `link-horizontal`, `link-vertical`, `quadratic` with control1, and `cubic` with control1/control2. Two endpoints alone do not imply a smooth bend.

Curves are evaluated before scales. Monotone and step curves require constant Z; monotone inputs must be strictly ordered along the chosen axis within each finite run. Nothing sorts automatically. Nonlinear spherical paths use supplied unwrapped longitude/latitude/radial-offset values; linear spherical paths retain their interpolation setting. Adaptive subdivision uses the existing 0.5-pixel tolerance and bounded path budgets. Extreme zoom can report an execution-budget error instead of submitting unbounded work.

## Polar radius

```svelte
<Plot data={data} coordinates="polar" y={{ domain: [0, 3] }}>
  <Points x="angle" y="radius" />
</Plot>
```

Polar X is angle and Y is radius. The default angle unit is degrees; use `angleUnit="custom"` and `anglePeriod` for other periods. Angle zero points right and positive angles turn counterclockwise. The effective radius is `baseRadius + radialScale * y`, with a default base radius of zero in polar mode. Negative effective radii are excluded, and zero radius is a valid origin. There is no horizontal repetition.

Background interaction can invert a nonzero radius to an angle and radius. The angle is undefined at zero radius; mark selections retain their source coordinates.

## Hierarchies and scatterplot matrices

`Tree root="id"` provides Nodes and Edges scopes like Force. It creates a deterministic breadth-first spanning tree, removes unreachable nodes and non-tree edges, and arranges subtrees tidily. Defaults are undirected traversal, downward orientation, and spacing 1. `directed`, `orientation`, `siblingSpacing`, and `depthSpacing` configure the layout. To let the viewer change `root` or `orientation`, read an input in it (`orientation={input("orientation")}` with a Select; docs/INPUTS.md). Tree is not a simulation and does not provide dragging.

Every mode uses the same rooting rules: `directed=true` follows source-to-target edges from the chosen root; `false` traverses either way and reroots its reachable component. Root depth is zero. Edges publish the child endpoint's `depth`, regardless of the original edge direction, so `depth <= cutoff` filters Nodes and Edges consistently. Nodes retain their node-table identity and keys during layout changes; automatic bounds refit the new geometry unless domains are explicit.

Nodes expose `parentPosition`, `parentX`, and `parentY`; partition also exposes `parentX0`, `parentX1`, `parentY0`, and `parentY1`. These are the parent's coordinates in the current oriented layout, with NaN for roots. Use them in numeric animation endpoint expressions, such as `x={animate(col.x, {enter: col.parentX, exit: col.parentX})}`. Enter reads the new layout and exit reads the previous layout.

`root` also accepts a scalar reduction expression over the original node table, including selection. For numeric IDs, `where(sum(view.selected), min(where(view.selected, col.id, sentinel)), defaultRoot)` focuses the selected node without a callback. See [Zoomable sunburst](/examples/sunburst) and [Expandable tree](/examples/expandable-tree).

`GraphData nodes={people} edges={links} nodeKey="id"` owns the node and edge relationship. `source` and `target` name its endpoint columns. Without `nodes`, GraphData infers them from the edges' endpoints; without `edges` too, the current table (a Plot's data, a Data or a transform above) is the edges. Its `reduce` and `nodeFrom` add node columns from explicit grouped reducers over the edges (FromEdges was folded into GraphData, TODO 137.3). Nodes and Edges select ordinary tables; transforms inside them preserve the relationship while changing only that branch. Filtering nodes induces the surviving edges. Aggregation that discards IDs ends the graph capability.

Force, Tree, DAG, Pack, Treemap and Sankey consume graph data and keep their algorithm settings. They no longer construct nodes or accept `source`, `target`, `nodes` or `nodeKey`. Tree omits nodes unreachable from its root; Pack and Treemap require a connected hierarchy. Node attributes can drive Force strengths, targets and radii.

Positioned graphs need no layout. Put `position`, or `x`/`y` and optional `z`, on nodes directly or with Calculate inside Nodes. Edges lazily gather current node coordinates as `start`/`end`; marks read these as ordinary columns. For example:

```svelte
<GraphData nodes={people} edges={links} nodeKey="person_id">
  <Nodes>
    <Calculate columns={{ x: "year", y: "score" }}>
      <Plot>
        <Edges><Segments start="start" end="end" /></Edges>
        <Nodes><Points position="position" /></Nodes>
      </Plot>
    </Calculate>
  </Nodes>
</GraphData>
```

Migrate old `Graph` calls to this form. Move layout endpoint/table props to GraphData. Replace `Nodes(data=, key=)` with the provided node table or an ordinary Join inside Nodes.

`Tree mode="partition"` adds `x0`/`x1`/`y0`/`y1` bounds while keeping `x`/`y` as centers. Use `nodeWidth` for leaf weights, `layerHeight` for bands, and `childAlign` for spare space in `widthMode="fixed"`. The default proportional mode sums descendant leaf widths. `visualMargin` (default 0) insets each published bound by half its value on every side, creating that much visible space between adjacent rectangles without changing their layout spans or centers; an inset stops at the rectangle center if the margin exceeds its size. It applies only in partition mode. These intervals draw icicle rectangles directly or map to sunburst sectors in a polar Plot. Partition rejects cycles and multiple parents within the reachable hierarchy; disconnected components are omitted. The default tidy mode keeps its prior spanning-tree behavior.

Partition accepts **zero** node widths and band heights. `layerHeight` can be a number, node-table column or expression; each child's band starts where its parent's band ends. Current-value tween columns from Calculate inside Nodes can drive `nodeWidth` and `layerHeight`; layout runs **after** their producer publishes the frame. Direct tween expressions on those inputs also own their interpolation before layout. Keep the topology stable and tween excluded subtrees' weights to zero and ancestors' heights to zero to animate focus; reversing the values grows them again. Every intermediate layout preserves parent/child containment. Filter zero-area rectangles after layout. No recursive parent tracking or second mark-position transition is needed. The sunburst example uses this pattern with polar automatic bounds.

`Tree mode="cluster"` draws dendrograms (d3.cluster): every leaf at 0 along the tree and one `siblingSpacing` apart across it, leaf k at k; each parent at the mean of its children and 1 + its tallest child from the leaves. `height="height"` names a nodes-table column (or expression) of merge heights and draws the tree to scale, as scipy does: y is the height in `"down"` (the root at the top), -height in `"up"`, x is the height in `"left"` and -height in `"right"`. Leaves take height 0 (missing reads as 0); a merge's height must be finite and at least its children's, and nodes the root cannot reach are omitted. Every mode publishes `order` on its nodes, each leaf's place among the leaves left to right (NaN for inner nodes), so a heatmap can sort its rows or columns to match; `order` is therefore reserved in node tables. Right-angle links are Segments with `curve="step-after"` for down/up and `curve="step-before"` for left/right (arcs then radial lines in a polar Frame). Trees are precomputed: Python's `hm.linkage_table(Z, labels)` turns a scipy linkage matrix into the edge and node tables, and the Tree reference page has the JavaScript recipe for merge lists. The clustermap example puts two dendrograms in Frames beside a heatmap, their leaf axes over its rows and columns (domain [-0.5, n - 0.5] over n cells).

`Pack` and `Treemap` use d3-hierarchy on the CPU to lay out a connected hierarchy from directed `source`/`target` edges and `root`. Both consume the graph's node table and accept `value` as a node-column expression, and `width`/`height` extents (default 1 by 1). Leaf values set area; omitted values make leaves equal. `Pack` publishes `x`, `y`, `position`, radius `r`, and enclosing bounds. `Treemap` publishes rectangle bounds and centers, with inner/outer padding and tile options. Both publish `parent`, `depth`, `degree`, original node attributes, and original edge rows with center endpoints. They reject cycles, multiple parents, and disconnected nodes, including isolated IDs supplied by a node table. Their examples show nested circles and weighted rectangles.

`DAG` uses d3-dag's Sugiyama layout for acyclic directed networks. It exposes node bounds and full edge route points; `<Edges><Routes /></Edges>` draws the routed paths with the original edge-row identity. It reads layout inputs to the CPU when data changes, while camera movement does not rerun the layout. Routes starts drawing only once the route points exist, after the node marks, but it still draws at its written position: write `<Edges>` before `<Nodes>` to keep the routes under the node symbols, or after to draw them on top (docs/RENDERING.md, "Mark order in 2D").

```svelte
<Data value={table}>
  <Facet pairs={['length', 'width', 'height']}>
    <Plot axes2d><Points x="x" y="y" fill="species" /></Plot>
  </Facet>
</Data>
```

Facet pairs uses lazy aliases of source columns: each cell's `x` and `y` are its fields. `triangle="upper"` or `"lower"` and `diagonal={false}` reduce the matrix, and `pairs={{x: [...], y: [...]}}` makes a rectangular one. The default `scales="field"` shares domains according to the actual source field, not a global numeric domain across unrelated units. Other columns and row identities are retained. The old `<Pairs>` wrapper was removed; use Facet's `pairs` prop directly (docs/FACETS.md).

Python exposes the same components using context managers and snake_case properties. See notebooks 14–18 and the separate gallery pages.


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
readbacks. See [Expandable tree](/examples/expandable-tree) and [Sunburst](/examples/sunburst).
