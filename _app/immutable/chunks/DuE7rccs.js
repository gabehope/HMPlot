const t=`import hmplot as hm

data = {"source": ["root", "root", "a", "a", "b"], "target": ["a", "b", "a1", "a2", "b1"]}
with hm.Plot(data=data, height=300) as plot:
    with hm.GraphData(source="source", target="target"):
        with hm.Tree(root="root"):
            with hm.Nodes():
                hm.Text(position="position", text="id")
plot
`;export{t as default};
