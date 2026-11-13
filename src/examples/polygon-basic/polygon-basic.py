import hmplot as hm

data = {
    "x": [0, 2, 2, 0, 3, 5, 4],
    "y": [0, 0, 2, 2, 0, 0, 2],
    "shape": ["a", "a", "a", "a", "b", "b", "b"],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Polygon(x="x", y="y", series="shape")
plot
