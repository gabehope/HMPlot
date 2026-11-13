import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    hm.Checkbox(name="line")
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y")
        hm.Line(x="x", y="y", visible=hm.input.line)
scene
