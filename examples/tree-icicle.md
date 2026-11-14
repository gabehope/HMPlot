# Tree icicle

Nested hierarchy rectangles from Tree partition bounds.

## Python

```python
"""Icicle rectangles from the Tree partition mode."""
import hmplot as hm

edges = {"source": ["Root", "Root", "A", "A", "B", "B"],
         "target": ["A", "B", "A1", "A2", "B1", "B2"]}
nodes = {"id": ["Root", "A", "B", "A1", "A2", "B1", "B2"],
         "weight": [1, 1, 1, 2, 1, 1, 2]}
with hm.Data(edges) as chart:
    with hm.GraphData(nodes=nodes, edges=edges, node_key="id", source="source", target="target"):
        with hm.Tree(root="Root", mode="partition", orientation="up", node_width="weight", visual_margin=0.08):
            with hm.Plot(height=350):
                with hm.Nodes():
                    hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1", fill="depth")
                    hm.Text(x="x", y="y", text="id", size=11)
chart
```

## Svelte

```svelte
<GraphData><Tree mode="partition" root="Root"><Nodes><Rect x0="x0" x1="x1" y0="y0" y1="y1" /></Nodes></Tree></GraphData>
```
