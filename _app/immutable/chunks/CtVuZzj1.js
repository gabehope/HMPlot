const n=`import hmplot as hm

data = {"name": ["a", "b", "c"], "before": [1, 2, 1.5], "after": [3, 2.5, 4]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    points = hm.Points(x="before", y="name")
    anchor = hm.Anchor(x="after", y="name")
    hm.charts.Arrows(connections=hm.connect(points, anchor))
plot
`;export{n as default};
