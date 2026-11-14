const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6, 7, 8], "y": [2, 5, 3, 6, 4, 7, 5, 8]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.stats.Window(field="y", size=3):
        hm.Line(x="x", y="smoothed")
plot
`;export{t as default};
