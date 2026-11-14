const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2], "count": [40, 10, 25, 5]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Line(x="x", y="y")
    with hm.Frame(y={"domain": "auto", "side": "right"}):
        hm.Line(x="x", y="count")
plot
`;export{t as default};
