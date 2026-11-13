<script>
  import { onMount, tick } from "svelte";
  import {
    Plot,
    Tree,
    Nodes,
    Edges,
    Filter,
    Points,
    Rect,
    Segments,
    Text,
    col,
    animate,
    where,
    less_equal,
    greater,
    GraphData,
  } from "$lib/index";
  let plot = $state(),
    tree = $state(),
    points = $state();
  let root = $state(0),
    mode = $state("tidy"),
    orientation = $state("down"),
    cutoff = $state(10),
    explicit = $state(false);
  let rows = $state({
    id: [0, 1, 2, 3, 4],
    name: ["Root", "Branch", "Other", "Leaf A", "Leaf B"],
    weight: [1, 1, 1, 2, 3],
  });
  const edges = { source: [0, 0, 1, 1], target: [1, 2, 3, 4] };
  const endpoint = (axis) =>
    where(greater(col.depth, 0), col["parent" + axis.toUpperCase()], col[axis]);
  onMount(() => {
    window.treeLayouts = {
      get plot() {
        return plot;
      },
      get points() {
        return points;
      },
      async set(values) {
        if (values.root !== undefined) root = values.root;
        if (values.mode !== undefined) mode = values.mode;
        if (values.orientation !== undefined) orientation = values.orientation;
        if (values.cutoff !== undefined) cutoff = values.cutoff;
        if (values.explicit !== undefined) explicit = values.explicit;
        if (values.weight !== undefined)
          rows = { ...rows, weight: [1, 1, 1, values.weight, 3] };
        await tick();
        await tree.whenSettled();
        await plot.whenSettled();
      },
      async state() {
        await plot.whenSettled();
        const options = plot.getFrames()[0].getFrameOptions();
        const { blob } = await plot.exportSVG({ mode: "vector" });
        const svg = new DOMParser().parseFromString(
          await blob.text(),
          "image/svg+xml",
        );
        return {
          bounds: { x: options.get("xbounds"), y: options.get("ybounds") },
          inferred: options.inferredDomains,
          labels: [...svg.querySelectorAll("text")]
            .filter((t) => /^(Root|Branch|Other|Leaf)/.test(t.textContent))
            .map((t) => ({
              name: t.textContent,
              x: Number(t.getAttribute("x")),
              y: Number(t.getAttribute("y")),
            })),
          frames: points.getMark().view.lifecycle.completedFrame,
          error: plot.getRenderError(),
        };
      },
    };
    return () => delete window.treeLayouts;
  });
</script>

<Plot
  bind:this={plot}
  data={edges}
  width={680}
  height={440}
  autoBounds
  x={explicit ? { domain: [-10, 10] } : {}}
  y={explicit ? { domain: [-10, 10] } : {}}
>
  <GraphData nodes={rows} {edges} nodeKey="id" source="source" target="target"
    ><Tree
      bind:this={tree}
      {root}
      {mode}
      {orientation}
      directed
      nodeWidth="weight"
    >
      <Edges
        ><Filter where={less_equal(col.depth, cutoff)}
          ><Segments start="start" end="end" color="#aaa" /></Filter
        ></Edges
      >
      <Nodes
        ><Filter where={less_equal(col.depth, cutoff)}>
          {#if mode === "partition"}<Rect
              x0="x0"
              x1="x1"
              y0="y0"
              y1="y1"
              opacity={0.15}
            />{/if}
          <Points
            bind:this={points}
            x={animate("x", {
              enter: endpoint("x"),
              exit: endpoint("x"),
              duration: 600,
              easing: "linear",
            })}
            y={animate("y", {
              enter: endpoint("y"),
              exit: endpoint("y"),
              duration: 600,
              easing: "linear",
            })}
            size={14}
            fill="#9b47cc"
          />
          <Text x="x" y="y" text="name" dy={-20} size={14} />
        </Filter></Nodes
      >
    </Tree></GraphData
  >
</Plot>
