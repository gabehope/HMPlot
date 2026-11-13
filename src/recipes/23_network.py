"""A network laid out by forces
GraphData builds a graph from source and target columns; Force lays it out; Edges and Nodes draw it."""
import hmplot as hm

edges = {"source": ["a", "a", "b", "c", "c", "d", "e", "f"], "target": ["b", "c", "c", "d", "e", "e", "f", "a"]}

with hm.Plot(data=edges, height=360) as chart:
    with hm.GraphData():
        with hm.Force(warmup=300):
            with hm.Edges():
                hm.Segments(start="start", end="end", color="#9aa5b1")
            with hm.Nodes():
                hm.Points(position="position", fill="#2f6f9f", size=10)
chart
