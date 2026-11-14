const t=`import hmplot as hm

data = {"source": ["A", "A", "B", "C", "D"], "target": ["B", "C", "C", "D", "E"]}
with hm.Plot(data=data, height=300) as plot:
    with hm.GraphData(source="source", target="target"):
        with hm.Force(warmup=300):
            with hm.Edges():
                hm.Segments(start="start", end="end")
            with hm.Nodes():
                hm.Points(position="position")
plot
`;export{t as default};
