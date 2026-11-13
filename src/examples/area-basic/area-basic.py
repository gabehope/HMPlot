import hmplot as hm

data = {"x": [1, 2, 3, 4, 5], "y": [2, 4, 3, 5, 4]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Area(x="x", upper="y")
plot
