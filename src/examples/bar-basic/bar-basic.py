import hmplot as hm

data = {"group": ["A", "B", "C", "D"], "total": [5, 8, 4, 7]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.Bar(x="group", y="total")
plot
