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
