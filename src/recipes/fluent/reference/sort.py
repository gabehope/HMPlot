import hmplot as hm

points = hm.Data({"x": [3, 1, 4, 2, 5], "y": [2, 1, 4, 3, 5]})
with hm.Scene() as chart:
    with hm.Plot(height=300, axes2d=True):
        hm.Line(data=points.sort("x"), x="x", y="y")
chart
