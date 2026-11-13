import hmplot as hm

data = {"x": [1, 3, 5, 7, 9], "y": [2, 4, 1, 5, 3]}
with hm.Scene() as scene:
    hm.TextInput(name="caption", value="My observations", placeholder="Plot title")
    with hm.Plot(data=data, height=300, axes2d=True, title=hm.input.caption):
        hm.Points(x="x", y="y", size=12)
scene
