import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Slider(name="size", min=2, max=12, step=1, value=5)
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y", size=hm.input.size)
scene
