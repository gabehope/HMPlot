import hmplot as hm

data = {"study": ["Trial A", "Trial B", "Trial C"], "estimate": [0.8, 1.1, 1.3],
        "low": [0.6, 0.9, 1.0], "high": [1.0, 1.4, 1.6]}
with hm.Plot(data=data, height=300, axes2d=True, x={"label": "Risk ratio"}) as plot:
    hm.charts.ForestPlot(x="estimate", y="study", lower="low", upper="high", reference=1,
                         interval={"color": "#5b6470", "cap_size": 8})
plot
