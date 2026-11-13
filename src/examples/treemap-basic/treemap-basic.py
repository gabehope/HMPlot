import hmplot as hm

data = {"source": ["root", "root", "a", "a", "a", "b", "b"],
        "target": ["a", "b", "a1", "a2", "a3", "b1", "b2"]}
with hm.Plot(data=data, height=300) as plot:
    with hm.GraphData(source="source", target="target"):
        with hm.Treemap(root="root", padding=0.02):
            with hm.Nodes():
                hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1", fill="depth")
plot
