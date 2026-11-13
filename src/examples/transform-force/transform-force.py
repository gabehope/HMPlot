import hmplot as hm

# A small team graph laid out by a force simulation on the GPU. Run plays and pauses it; Step
# and Reset act on each press (a Button's value counts its presses); Repulsion pushes the nodes
# apart. Drag a node to move it.
links = {
    "source": ["A", "A", "B", "B", "C", "D", "E", "F", "G", "H"],
    "target": ["B", "C", "D", "E", "F", "F", "G", "H", "H", "A"],
}
people = {
    "node": ["A", "B", "C", "D", "E", "F", "G", "H"],
    "team": ["North", "North", "West", "West", "East", "East", "South", "South"],
}

with hm.Scene(gap=12) as scene:
    hm.Markdown("Eight people in four teams, linked by who works with whom, laid out by a force simulation "
                "on the GPU. It starts paused: check **Run** to play it, or press **Step** to advance one "
                "tick; **Reset** returns to the starting layout. **Repulsion** pushes the nodes apart. Drag a "
                "node to move it.")
    with hm.Row(wrap=True, min_width=0):
        hm.Checkbox(name="run", label="Run")
        hm.Button(name="step", label="Step")
        hm.Button(name="restart", label="Reset")
        hm.Slider(name="repulsion", min=0, max=200, step=1, value=30, label="Repulsion")
    with hm.Data(links):
        with hm.GraphData(nodes=people, edges=links, node_key="node", source="source", target="target"):
            with hm.Force(dimensions=2, running=hm.input.run, step=hm.input.step, reset=hm.input.restart, repulsion=hm.input.repulsion):
                with hm.Plot(height=420, axes2d=True, x={"domain": [-90, 90]}, y={"domain": [-90, 90]}):
                    with hm.Edges():
                        hm.Segments(start="start", end="end", color="#8694a0", width=1)
                    with hm.Nodes(drag=True):
                        hm.Points(position="position", fill="team", size=14,
                                  outline_color="#30343b", outline_width=1.05)
