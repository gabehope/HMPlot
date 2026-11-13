import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    hm.Title("Four measurements")
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y")
scene
