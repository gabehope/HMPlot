const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    with hm.Plot(data=data, height=300, axes2d=True) as top:
        hm.Points(x="x", y="y")
    with hm.Plot(data=data, height=300, axes2d=True) as bottom:
        hm.Line(x="x", y="y")
    hm.LinkViews(top, bottom)
scene
`;export{t as default};
