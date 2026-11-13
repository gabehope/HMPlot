import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6, 7, 8], "y": [2.1, 2.9, 3.2, 4.8, 4.9, 6.1, 6.8, 8.2]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Points(x="x", y="y")
    hm.charts.Smooth(x="x", y="y")
plot
