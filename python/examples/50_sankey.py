"""A weighted DAG laid out as a Sankey diagram."""
import hmplot as hm

edges = {"source": ["Inputs", "Inputs", "A", "B"],
         "target": ["A", "B", "Output", "Output"],
         "value": [3, 2, 3, 2]}
nodes = {"id": ["Inputs", "A", "B", "Output"],
         "group": ["source", "branch", "branch", "sink"]}

with hm.Data(edges) as chart:
    with hm.GraphData(nodes=nodes, edges=edges, node_key="id", source="source", target="target"):
        with hm.Sankey(value="value"):
            with hm.Plot(height=420, x={"domain": [-0.05, 1.05]}, y={"domain": [-0.05, 1.05]}):
                with hm.Edges():
                    hm.Flow(start_lower="startLower", end_lower="endLower",
                            start_upper="startUpper", end_upper="endUpper",
                            fill="#7b9865", opacity=0.55)
                with hm.Nodes():
                    hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1", fill="group")
chart
