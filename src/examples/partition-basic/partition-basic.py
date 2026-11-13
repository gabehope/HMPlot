import hmplot as hm

data = {
    "x": [1, 2, 3, 4, 1, 2, 3, 4],
    "y": [3, 1, 4, 2, 2, 4, 1, 3],
    "group": ["a", "a", "a", "a", "b", "b", "b", "b"],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Partition(by="group"):
        hm.Line(x="x", y="y")
plot
