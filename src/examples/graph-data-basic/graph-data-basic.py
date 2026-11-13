import hmplot as hm

edges = {"source": ["A", "A", "B", "C"], "target": ["B", "C", "D", "D"]}
nodes = {"id": ["A", "B", "C", "D"], "column": [0, 1, 1, 2], "lane": [1, 0, 2, 1]}
with hm.GraphData(nodes=nodes, edges=edges) as plot:
    with hm.Nodes():
        with hm.Calculate(x=hm.multiply("column", 2), y="lane"):
            with hm.Plot(height=300):
                with hm.Edges():
                    hm.Segments(start="start", end="end")
                with hm.Nodes():
                    hm.Points(position="position")
plot
