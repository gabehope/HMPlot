# Large force graph

Explore seeded graphs of 64 to 10,000 nodes, thin edges, dragging, and a linked overview in 2D or 3D.

## Python

```python
import hmplot as hm

# The bundled plugin generates only the selected graph, in the browser. Changing the seed
# works in notebooks and exported HTML; no Python callback or precomputed graph collection.
SIZES = [64, 128, 256, 512, 1024, 2048, 10_000, 100_000]

# The layout's dimensions follow the Dimensions select: 3 for a 3D plot, 2 for a 2D one.
dimensions = hm.where(hm.input.view == hm.literal("3d"), 3, 2)

with hm.Scene(gap=12) as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Select(name="nodes", label="Nodes", options={f"{n:,}": n for n in SIZES}, value=512)
        hm.Select(name="view", label="Dimensions", options={"2D": "2d", "3D": "3d"})
        hm.Checkbox(name="run", label="Run")
        hm.Button(name="step", label="Step")
        hm.Button(name="restart", label="Reset")
        hm.Button(name="regenerate", label="Regenerate graph", value=42)
    hm.Markdown("{$nodes} nodes, three edges each, in seeded communities of 32. Repulsion is exact on the GPU "
                "below 4,096 nodes; larger graphs use a grid approximation far away and stay exact nearby.",
                font_size=12, color="#697785")
    with hm.Data(rows=1):
        with hm.Transform(kind="community-graph", nodes=hm.input.nodes, seed=hm.input.regenerate):
            with hm.Force(dimensions=dimensions, link_distance=12, repulsion=50, running=hm.input.run, step=hm.input.step, reset=hm.input.restart):
                # overview: the linked minimap of the whole graph.
                with hm.Plot(type=hm.input.view, height=560, overview=True):
                    with hm.Edges():
                        hm.Segments(start="start", end="end", color="#718394", opacity=0.35, width=1)
                    with hm.Nodes(drag=True):
                        hm.Points(position="position", fill="degree", fill_scale=hm.continuous(domain=[0, 14]), size=7,
                                  outline_color="#f4f2ed", outline_width=0.5)
    hm.Markdown("Starts paused. Drag nodes, check Run, or press Step; larger graphs advance more slowly. Reset "
                "returns to the starting layout; Regenerate graph changes the edges.", font_size=12, color="#697785")
```

## Svelte

```svelte
<script>
  import {
    InputContext,
    Select,
    Checkbox,
    Button,
    Data,
    Transform,
    Force,
    Plot,
    Edges,
    Segments,
    Nodes,
    Points,
    input,
    continuous,
  } from "hmplot";

  // Generate only the selected graph, through the same bundled plugin Python uses.
  const SIZES = [64, 128, 256, 512, 1024, 2048, 10000, 100000];
  const sizes = Object.fromEntries(
    SIZES.map((n) => [n.toLocaleString("en-US"), n]),
  );
  // A Plot's type and a Force's dimensions are props of their own: the Dimensions select sets
  // them through `view`.
  let view = $state("2d"),
    nodes = $state(512);
</script>

<InputContext>
  <div class="controls">
    <Select name="nodes" label="Nodes" options={sizes} bind:value={nodes} />
    <Select
      name="view"
      label="Dimensions"
      options={{ "2D": "2d", "3D": "3d" }}
      bind:value={view}
    />
    <Checkbox name="run" label="Run" />
    <Button name="step" label="Step" />
    <Button name="restart" label="Reset" />
    <Button name="regenerate" label="Regenerate graph" value={42} />
  </div>
  <p class="note">
    {nodes.toLocaleString("en-US")} nodes, three edges each, in seeded communities
    of 32. Repulsion is exact on the GPU below 4,096 nodes; larger graphs use a grid
    approximation far away and stay exact nearby.
  </p>
  <Data rows={1}>
    <Transform
      kind="community-graph"
      params={{ nodes: input.nodes, seed: input.regenerate }}
    >
      <!-- The layout's dimensions follow the view: 3 for a 3D plot, 2 for a 2D one. -->
      <Force
        dimensions={view === "3d" ? 3 : 2}
        linkDistance={12}
        repulsion={50}
        running={input("run")}
        step={input("step")}
        reset={input("restart")}
      >
        <!-- overview: the linked minimap of the whole graph. -->
        <Plot type={view} height={560} overview>
          <Edges>
            <Segments
              start="start"
              end="end"
              color="#718394"
              opacity={0.35}
              width={1}
            />
          </Edges>
          <Nodes drag>
            <Points
              position="position"
              fill="degree"
              fillScale={continuous({ domain: [0, 14] })}
              size={7}
              outlineColor="#f4f2ed"
              outlineWidth={0.5}
            />
          </Nodes>
        </Plot>
      </Force>
    </Transform>
  </Data>
  <p class="note">
    Starts paused. Drag nodes, check Run, or press Step; larger graphs advance
    more slowly. Reset returns to the starting layout; Regenerate graph changes
    the edges.
  </p>
</InputContext>

<style>
  /* Python's Scene(gap=12), Row(wrap=True, min_width=0) and Markdown(font_size=12, color="#697785"). */
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }
  .note {
    font-size: 12px;
    color: #697785;
    margin: 12px 0;
  }
</style>
```
