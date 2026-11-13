import hmplot as hm


@hm.template
def panel(data):
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.slot()
        hm.Line(x="x", y="y")


data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with panel(data) as chart:
    hm.Points(x="x", y="y")
chart
