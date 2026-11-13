import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Row() as row:
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y")
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Line(x="x", y="y")
row
