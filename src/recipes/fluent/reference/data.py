import hmplot as hm

points = hm.Data({"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]})
with hm.Plot(height=300, axes2d=True) as plot:
    hm.Points(data=points, x="x", y="y")
plot
