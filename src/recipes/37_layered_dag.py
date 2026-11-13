"""A pipeline as a layered graph
DAG lays the steps out in layers, left to right, and Routes draws each edge around the boxes between its ends; Text names each step."""
import hmplot as hm

edges = {"source": ["Ingest", "Ingest", "Parse", "Parse", "Validate", "Enrich", "Validate"],
         "target": ["Parse", "Validate", "Enrich", "Archive", "Report", "Report", "Archive"]}

with hm.Scene() as chart:
    with hm.Data(edges):
        with hm.GraphData(source="source", target="target"):
            with hm.DAG(node_width=1.3, node_height=0.65):
                with hm.Plot(height=420):
                    with hm.Edges():
                        hm.Routes(color="#7b9865", width=2)
                    with hm.Nodes():
                        hm.Points(position="position", size=8, fill="#2f6f9f")
                        hm.Text(x="x", y="y", text="id", dy=-15)
chart
