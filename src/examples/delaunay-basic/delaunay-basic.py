import hmplot as hm

data = {"x": [0, 2, 4, 1, 3, 2], "y": [0, 0, 0, 2, 2, 4]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Delaunay(x="x", y="y"):
        hm.Segments(start="start", end="end")
plot
