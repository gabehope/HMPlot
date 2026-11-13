"""Where a budget goes, as a Sankey diagram
Sankey stacks each node's flows by value; Flow draws each link as a band as wide as its value, Rect the nodes, colored by their group, and Text names them."""
import hmplot as hm

edges = {"source": ["Budget", "Budget", "Budget", "Staff", "Staff", "Services"],
         "target": ["Staff", "Services", "Equipment", "Salaries", "Training", "Hosting"],
         "value": [60, 25, 15, 52, 8, 25]}
nodes = {"id": ["Budget", "Staff", "Services", "Equipment", "Salaries", "Training", "Hosting"],
         "group": ["total", "area", "area", "item", "item", "item", "item"]}

with hm.Scene() as chart:
    with hm.Data(edges):
        with hm.GraphData(nodes=nodes, edges=edges, node_key="id", source="source", target="target"):
            with hm.Sankey(value="value"):
                with hm.Plot(height=420, x={"domain": [-0.05, 1.25]}, y={"domain": [-0.05, 1.05]}):
                    with hm.Edges():
                        hm.Flow(start_lower="startLower", end_lower="endLower",
                                start_upper="startUpper", end_upper="endUpper",
                                fill="#7b9865", opacity=0.55)
                    with hm.Nodes():
                        hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1", fill="group")
                        hm.Text(x="x1", y="y", text="id", dx=6, align="left")
chart
