const a=`import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6], "y": [3, 4, 2, 5, 6, 5]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Line(x="x", y="y")
    hm.charts.Crosshair()
plot
`;export{a as default};
