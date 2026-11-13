import hmplot as hm

data = {"x": [1, 2, 2, 3, 3, 3, 4, 4, 5, 7]}
with hm.Scene() as scene:
    hm.Slider(name="bins", min=1, max=10, step=1, value=4)
    with hm.Plot(data=data, height=300, axes2d=True):
        with hm.stats.Bin(x="x", bins=hm.input.bins):
            hm.Rect(x0="x0", x1="x1", y0=0, y1="count")
scene
