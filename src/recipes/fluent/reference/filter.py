import hmplot as hm

points = hm.Data({"x": [1, 2, 3, 4, 5, 6], "y": [3, 1, 4, 1, 5, 2]})
with hm.Scene() as chart:
    with hm.Plot(height=300, axes2d=True):
        hm.Points(data=points.filter(hm.col.y > 2), x="x", y="y")
chart
