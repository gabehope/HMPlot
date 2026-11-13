<script>
  import {
    Plot,
    Frame,
    Data,
    Tree,
    Edges,
    Nodes,
    Segments,
    Rect,
    Text,
    continuous,
    GraphData,
  } from "$lib";
  import { untrack } from "svelte";
  let { plot = $bindable(), onready = undefined } = $props();
  $effect(() => {
    const p = plot;
    untrack(() => onready?.(p));
  });

  // Twelve samples by eight genes, from three sample groups and two gene groups.
  const samples = Array.from({ length: 12 }, (_, i) => `S${i + 1}`);
  const genes = Array.from({ length: 8 }, (_, j) => `G${j + 1}`);
  const sampleGroup = [0, 2, 1, 0, 1, 2, 2, 0, 1, 0, 2, 1],
    geneGroup = [1, 0, 1, 1, 0, 0, 1, 0];
  const pattern = [
    [2, -1],
    [-1.2, 1.6],
    [0.4, -0.2],
  ];
  const values = samples.map((_, i) =>
    genes.map(
      (_, j) =>
        pattern[sampleGroup[i]][geneGroup[j]] +
        0.35 * Math.sin(3.1 * i + 1.7 * j + i * j),
    ),
  );

  // Merge rows [a, b, height] from scipy.cluster.hierarchy.linkage(values, "average") and of
  // its transpose (python/examples/71_clustermap.py computes them).
  const sampleMerges = [
    [0, 3, 0.259],
    [8, 11, 0.697],
    [2, 13, 0.769],
    [9, 12, 0.814],
    [4, 14, 0.922],
    [1, 6, 0.933],
    [5, 17, 0.968],
    [7, 15, 0.997],
    [10, 18, 1.017],
    [19, 20, 4.027],
    [16, 21, 6.763],
  ];
  const geneMerges = [
    [0, 2, 0.852],
    [1, 5, 1.091],
    [6, 8, 1.119],
    [3, 10, 1.143],
    [4, 7, 1.158],
    [9, 12, 1.268],
    [11, 13, 8.707],
  ];

  // Tree's tables from merge rows (leaves 0..n-1; merge i makes node n + i), and the leaves in
  // the order Tree mode="cluster" places them (its `order` column).
  function linkageTable(merges, labels) {
    const n = labels.length,
      edges = { source: [], target: [] };
    const nodes = {
      id: labels.map((_, i) => i),
      label: [...labels],
      height: labels.map(() => 0),
    };
    merges.forEach(([a, b, height], i) => {
      edges.source.push(n + i, n + i);
      edges.target.push(a, b);
      nodes.id.push(n + i);
      nodes.label.push(null);
      nodes.height.push(height);
    });
    const leaves = [],
      stack = [2 * n - 2];
    while (stack.length) {
      const node = stack.pop();
      if (node < n) leaves.push(node);
      else stack.push(merges[node - n][1], merges[node - n][0]);
    }
    return { edges, nodes, root: 2 * n - 2, leaves };
  }
  const rows = linkageTable(sampleMerges, samples),
    columns = linkageTable(geneMerges, genes);
  // The cells in leaf order: leaf k of each tree sits at k, over row (or column) k.
  const cells = { x0: [], x1: [], y0: [], y1: [], value: [] };
  rows.leaves.forEach((r, y) =>
    columns.leaves.forEach((c, x) => {
      cells.x0.push(x);
      cells.x1.push(x + 1);
      cells.y0.push(y);
      cells.y1.push(y + 1);
      cells.value.push(values[r][c]);
    }),
  );
  const top = Math.max(...cells.value.map(Math.abs));
  const colors = continuous({ colormap: "RdBu", domain: [-top, top] });
  const R = samples.length,
    C = genes.length,
    hidden = { visible: false };
</script>

<!-- One unit per cell: the heatmap fills [0, C] x [0, R]; the dendrograms and labels sit in
     Frames beside it that share its rows (y) or columns (x). -->
<Plot
  bind:this={plot}
  responsive
  height={480}
  x={{ domain: [-3.2, C + 1.4], ...hidden }}
  y={{ domain: [-0.9, R + 3.2], ...hidden }}
>
  <Data value={cells}
    ><Rect
      x0="x0"
      x1="x1"
      y0="y0"
      y1="y1"
      fill="value"
      fillScale={colors}
    /></Data
  >
  <Data value={rows.edges}>
    <GraphData
      nodes={rows.nodes}
      edges={rows.edges}
      nodeKey="id"
      source="source"
      target="target"
      ><Tree
        root={rows.root}
        mode="cluster"
        height="height"
        orientation="right"
      >
        <!-- "right": the root at the left, and x = -height. Leaf k at y = k, the center of row k. -->
        <Frame
          x={{ domain: [-7, 0], range: [-3, -0.15], ...hidden }}
          y={{ domain: [-0.5, R - 0.5], range: [0, R], ...hidden }}
        >
          <Edges
            ><Segments
              start="start"
              end="end"
              curve="step-before"
              color="#3c4650"
              width={1.5}
            /></Edges
          >
        </Frame>
        <!-- Leaf labels by `order` (NaN, so not drawn, for the merges), right of the heatmap. -->
        <Frame
          x={{ domain: [0, 1], range: [C + 0.15, C + 1.15], ...hidden }}
          y={{ domain: [-0.5, R - 0.5], range: [0, R], ...hidden }}
        >
          <Nodes
            ><Text x={0} y="order" text="label" align="left" size={12} /></Nodes
          >
        </Frame>
      </Tree></GraphData
    >
  </Data>
  <Data value={columns.edges}>
    <GraphData
      nodes={columns.nodes}
      edges={columns.edges}
      nodeKey="id"
      source="source"
      target="target"
      ><Tree
        root={columns.root}
        mode="cluster"
        height="height"
        orientation="down"
      >
        <!-- "down": the root at the top, and y = height. Leaf k at x = k, the center of column k. -->
        <Frame
          x={{ domain: [-0.5, C - 0.5], range: [0, C], ...hidden }}
          y={{ domain: [0, 9], range: [R + 0.15, R + 3], ...hidden }}
        >
          <Edges
            ><Segments
              start="start"
              end="end"
              curve="step-after"
              color="#3c4650"
              width={1.5}
            /></Edges
          >
        </Frame>
        <Frame
          x={{ domain: [-0.5, C - 0.5], range: [0, C], ...hidden }}
          y={{ domain: [0, 1], range: [-0.6, 0.4], ...hidden }}
        >
          <Nodes><Text x="order" y={0} text="label" size={12} /></Nodes>
        </Frame>
      </Tree></GraphData
    >
  </Data>
</Plot>
