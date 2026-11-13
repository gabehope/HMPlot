import hmplot as hm

points = hm.Data({"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]})
with hm.Scene() as chart:
    with hm.Plot(height=300, axes2d=True):
        hm.Points(data=points.with_columns(total=hm.col.x + hm.col.y), x="x", y="total")
chart
