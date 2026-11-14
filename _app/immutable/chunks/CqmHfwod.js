const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    with hm.Plot(data=data, height=300, axes2d=True) as plot:
        hm.Points(x="x", y="y")
    hm.Minimap(target=plot)
scene
`;export{t as default};
