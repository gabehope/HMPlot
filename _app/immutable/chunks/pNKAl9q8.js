const r=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 5, 4, 6], "lower": [2, 4, 3.5, 5], "upper": [4, 6, 4.5, 7]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.ErrorBars(x="x", y="y", lower="lower", upper="upper")
    hm.Points(x="x", y="y")
plot
`;export{r as default};
