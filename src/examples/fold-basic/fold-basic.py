import hmplot as hm

data = {"name": ["a", "b", "c"], "before": [1, 3, 2], "after": [2, 4, 1]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Fold(fields=["before", "after"]):
        hm.Points(x="key", y="value")
plot
