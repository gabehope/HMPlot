const a=`import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6], "y": [3, 4, 2, 5, 6, 5]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.BandY(y0=2, y1=4, fill="#3478c7")
    hm.Line(x="x", y="y")
plot
`;export{a as default};
