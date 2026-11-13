import hmplot as hm

data = {
    "shape": ["a", "a", "b", "b", "c", "c"],
    "measure": ["width", "height", "width", "height", "width", "height"],
    "value": [1, 2, 3, 1, 2, 4],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Pivot(field="measure", value=hm.sum("value"), by="shape"):
        hm.Points(x="width", y="height")
plot
