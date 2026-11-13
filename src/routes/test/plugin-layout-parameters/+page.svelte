<script>
  import { onMount, tick } from "svelte";
  import {
    Plot,
    Points,
    GraphData,
    Nodes,
    Transform,
    InputContext,
    Slider,
    input,
    mean,
    add,
    divide,
    floor,
    view,
    definePlugin,
    registerPlugin,
  } from "$lib/index";
  let plot,
    layout,
    offset = $state(1),
    runs = 0;
  registerPlugin(
    definePlugin({
      name: "test-layout-parameters",
      apiVersion: 1,
      setup(hm) {
        hm.layout("test.parameters", {
          parameters: {
            extra: {
              type: "object",
              properties: {
                offsets: {
                  type: "array",
                  items: {
                    type: "union",
                    variants: [
                      { type: "number" },
                      { type: "select", options: [false] },
                    ],
                  },
                  minLength: 1,
                },
              },
              required: ["offsets"],
              default: { offsets: [false] },
            },
            gap: {
              type: "expression",
              default: add(
                add(mean("weight"), input("offset")),
                floor(divide(view.time, 1000)),
              ),
            },
          },
          run({ params }) {
            runs++;
            return {
              nodeColumns: {
                position: [
                  [0, 1],
                  [params.gap + (params.extra.offsets[0] || 0), 1],
                ],
              },
            };
          },
        });
      },
    }),
  );
  onMount(() => {
    window.layoutParameters = {
      get plot() {
        return plot;
      },
      get runs() {
        return runs;
      },
      async offset(value) {
        offset = value;
        await tick();
        await layout.whenSettled();
      },
      async time(value) {
        await plot.setAnimationTime(value);
        await tick();
        await layout.whenSettled();
      },
      async geometry() {
        await layout.whenSettled();
        const result = await plot.exportSVG();
        return [
          ...new DOMParser()
            .parseFromString(await result.blob.text(), "image/svg+xml")
            .querySelectorAll("circle"),
        ].map((c) => +c.getAttribute("cx"));
      },
    };
    return () => delete window.layoutParameters;
  });
</script>

<InputContext>
  <Slider name="offset" min={0} max={5} bind:value={offset} />
  <Plot
    bind:this={plot}
    name="Layout parameters"
    width={400}
    height={200}
    responsive={false}
    axes2d={false}
    x={{ domain: [0, 10] }}
    y={{ domain: [0, 2] }}
  >
    <GraphData
      nodes={{ id: [0, 1] }}
      edges={{ source: [0], target: [1], weight: [1] }}
    >
      <Transform bind:this={layout} kind="test.parameters">
        <Nodes><Points position="position" size={12} /></Nodes>
      </Transform>
    </GraphData>
  </Plot>
</InputContext>
