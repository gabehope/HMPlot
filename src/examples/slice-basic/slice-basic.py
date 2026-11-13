import hmplot as hm

data = {
    "id": ["a", "a", "a", "b", "b", "b"],
    "time": [0, 1, 2, 0, 1, 2],
    "x": [1, 2, 4, 3, 2, 1],
    "y": [1, 3, 2, 4, 3, 1],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Slice(field="time", at=1.5, by="id"):
        hm.Points(x="x", y="y")
plot
