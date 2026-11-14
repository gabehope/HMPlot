const t=`import hmplot as hm

data = {"source": ["root", "root", "a", "a", "a", "b", "b"],
        "target": ["a", "b", "a1", "a2", "a3", "b1", "b2"]}
with hm.Plot(data=data, height=300, aspect="equal") as plot:
    with hm.GraphData(source="source", target="target"):
        with hm.Pack(root="root"):
            with hm.Nodes():
                hm.Points(position="position", size=hm.col.r * 2, size_units="data", fill="depth")
plot
`;export{t as default};
