const a=`import hmplot as hm

data = {"group": ["a", "a", "a", "b", "b", "b"], "value": [1, 2, 3, 4, 6, 5]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.stats.Summary(field="value", by="group", interval="standard-error"):
        hm.charts.ErrorBars(x="group", y="estimate", lower="lower", upper="upper")
plot
`;export{a as default};
