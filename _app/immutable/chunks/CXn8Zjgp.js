const t=`import hmplot as hm

data = {"source": ["a", "a", "b", "c", "a"], "target": ["b", "c", "d", "d", "d"]}
with hm.Plot(data=data, height=300) as plot:
    with hm.GraphData(source="source", target="target"):
        with hm.DAG():
            with hm.Edges():
                hm.Routes()
            with hm.Nodes():
                hm.Points(position="position")
plot
`;export{t as default};
