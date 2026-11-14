const t=`import hmplot as hm

data = {
    "x": [0, 1, 2, 0, 1, 2, 0.5, 1.5],
    "y": [0, 0, 0, 2, 2, 2, 1, 1],
    "temperature": [10, 12, 15, 11, 14, 18, 13, 16],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Interpolate(x="x", y="y", values=["temperature"]):
        hm.Heatmap(fill="temperature")
plot
`;export{t as default};
