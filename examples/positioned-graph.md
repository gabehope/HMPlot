# Positioned graph

Node positions computed from node columns, with edges gathered from those positions.

## Python

```python
"""A graph whose node coordinates come from node columns."""
import hmplot as hm

edges = {"source": ["A", "A", "B", "C"], "target": ["B", "C", "D", "D"]}
nodes = {"id": ["A", "B", "C", "D", "Solo"],
         "column": [0, 1, 1, 2, 2], "lane": [1, 0, 2, 1, 2.7]}
with hm.Data(edges) as chart:
    with hm.GraphData(nodes=nodes, edges=edges, node_key="id", source="source", target="target"):
        with hm.Nodes():
            with hm.Calculate(x=hm.multiply("column", 2), y="lane"):
                with hm.Plot(height=400):
                    with hm.Edges():
                        hm.Segments(start="start", end="end", width=2)
                    with hm.Nodes():
                        hm.Points(position="position", size=6)
                        hm.Text(x="x", y="y", text="id", dy=-15)
chart
```

## Svelte

```svelte
<GraphData {nodes} {edges}><Nodes><Calculate columns={{x: multiply("column", 2), y: "lane"}}>…</Calculate></Nodes></GraphData>
```
