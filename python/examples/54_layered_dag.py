"""Sugiyama layout with full routed edges."""
import hmplot as hm

edges = {"source": ["Input", "Input", "Parse", "Validate", "Parse"],
         "target": ["Parse", "Validate", "Render", "Render", "Archive"]}
with hm.Data(edges) as chart:
    with hm.GraphData(source="source", target="target"):
        with hm.DAG(node_width=1.3, node_height=0.65):
            with hm.Plot(height=450):
                with hm.Edges():
                    hm.Routes(color="#7b9865", width=2)
                with hm.Nodes():
                    hm.Points(position="position", size=7)
                    hm.Text(x="x", y="y", text="id", dy=-15)
chart
