const e=`import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6], "y": [3, 1, 4, 1, 5, 2], "group": ["a", "b", "c", "a", "b", "c"]}
with hm.Scene() as scene:
    hm.Select(multiple=True, name="groups", options=["a", "b", "c"], value=["a", "b"])
    with hm.Plot(data=data, height=300, axes2d=True):
        with hm.Filter(where=hm.is_in(hm.col.group, hm.input.groups)):
            hm.Points(x="x", y="y")
scene
`;export{e as default};
