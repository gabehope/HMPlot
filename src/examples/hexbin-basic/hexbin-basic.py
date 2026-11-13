import hmplot as hm

data = {
    "x": [1, 1.4, 2, 2.2, 2.5, 2.7, 3, 3.1, 3.5, 4, 4.2, 5],
    "y": [2, 2.6, 3, 2.8, 3.2, 3.1, 3, 3.5, 2.9, 4, 3.8, 4.5],
}
with hm.Plot(data=data, height=300, axes2d=True, aspect="equal") as plot:
    with hm.stats.Hexbin(x="x", y="y", bins=4):
        hm.Prism(x="x", y="y", width="width", depth="depth", rotation="rotation", shape="hexagon",
                 z0=0, z1=0, fill="count")
plot
