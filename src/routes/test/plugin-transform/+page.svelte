<script>
  import { onMount, tick } from "svelte";
  import {
    Plot,
    Points,
    Segments,
    GraphData,
    Nodes,
    Edges,
    Transform,
    definePlugin,
    registerPlugin,
  } from "$lib/index";
  let factor = $state(2),
    gap = $state(2),
    data = $state({ x: [1, 2, 3], y: [1, 1, 1] });
  let rowPlot, graphPlot, rowTransform, graphTransform;
  let traces = 0;
  let settingsEdits = [];
  const scale = definePlugin({
    name: "test-scale",
    apiVersion: 1,
    setup(hm) {
      const kernel = (values, amount) => {
        traces++;
        return values.mul(amount);
      };
      hm.transform("test.scale", {
        reads: "padded",
        output: "sameRows",
        parameters: { factor: { type: "number", default: 2, min: 0 } },
        outputs: () => [{ name: "x", type: "numeric", label: "Scaled x" }],
        run: ({ columns, params, jit }) => ({
          columns: { x: jit(kernel)(columns.x.ref, params.factor) },
        }),
      });
    },
  });
  registerPlugin(
    definePlugin({
      name: "test-layout",
      apiVersion: 1,
      setup(hm) {
        hm.layout("test.tree", {
          hierarchy: true,
          parameters: { gap: { type: "number", default: 2, min: 0 } },
          run: ({ graph, params }) => ({
            nodeColumns: {
              position: graph.hierarchy.depth.map((depth) => [
                1 + depth * params.gap,
                1,
              ]),
            },
            edgeColumns: { start: [[1, 1]], end: [[1 + params.gap, 1]] },
          }),
        });
      },
    }),
  );
  const common = {
    width: 320,
    height: 200,
    responsive: false,
    axes2d: false,
    background: "white",
    x: { domain: [0, 8] },
    y: { domain: [0, 4] },
  };
  onMount(() => {
    let stop;
    window.pluginTransform = {
      register: () => {
        stop?.();
        stop = rowTransform.subscribeSettings((value) =>
          settingsEdits.push(value),
        );
        registerPlugin(scale);
      },
      set: async (values) => {
        if (values.factor !== undefined) factor = values.factor;
        if (values.gap !== undefined) gap = values.gap;
        if (values.data) data = values.data;
        await tick();
      },
      settle: () =>
        Promise.all([rowTransform.whenSettled(), graphTransform.whenSettled()]),
      get plots() {
        return { rows: rowPlot, graph: graphPlot };
      },
      get traces() {
        return traces;
      },
      get edits() {
        return settingsEdits;
      },
    };
    return () => {
      stop?.();
      delete window.pluginTransform;
    };
  });
</script>

<Plot bind:this={rowPlot} {...common} {data} name="Plugin rows">
  <Transform bind:this={rowTransform} kind="test.scale" params={{ factor }}>
    <Points x="x" y="y" fill="#2060ff" size={10} />
  </Transform>
</Plot>
<Plot bind:this={graphPlot} {...common}>
  <GraphData
    nodes={{ id: ["root", "leaf"] }}
    edges={{ source: ["root"], target: ["leaf"] }}
  >
    <Transform bind:this={graphTransform} kind="test.tree" params={{ gap }}>
      <Edges><Segments start="start" end="end" /></Edges>
      <Nodes><Points position="position" fill="#ff2020" size={10} /></Nodes>
    </Transform>
  </GraphData>
</Plot>
