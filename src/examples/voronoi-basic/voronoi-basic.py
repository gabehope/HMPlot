import hmplot as hm

data = {"name": ["a", "b", "c", "d", "e"], "x": [1, 3, 2, 4, 2.5], "y": [1, 1, 3, 3, 2]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Voronoi(x="x", y="y"):
        hm.Polygon(fill="name")
plot
