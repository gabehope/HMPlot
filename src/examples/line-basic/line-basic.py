import hmplot as hm

data = {"x": [1, 2, 3, 4, 5], "y": [1, 3, 2, 5, 4]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Line(x="x", y="y")
plot
