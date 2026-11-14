const e=`import hmplot as hm

# Each press moves a point between 1 and 1000 on a log axis. animate() moves in the axis's scale,
# by equal ratios; tween() moves the value itself, by equal steps, so it passes 100 a tenth of the
# way. The gray dots mark each tenth of the way.
steps = [i / 10 for i in range(11)]
paths = {"x": [1] * 11 + [2] * 11, "y": [1000**t for t in steps] + [1 + 999 * t for t in steps]}
labels = {"x": [1, 2], "y": [1000, 1000], "text": ["animate()", "tween()"]}
up = hm.input.move - hm.floor(hm.input.move / 2) * 2
with hm.Scene() as scene:
    hm.Button(name="move", label="Move")
    with hm.Plot(height=320, axes2d=True, x={"domain": [0.5, 2.8], "visible": False},
                 y={"domain": [1, 1000], "transform": "log"}):
        with hm.Data(paths):
            hm.Points(x="x", y="y", size=3, fill="#c3ccd5")
        with hm.Data(labels):
            hm.Text(x="x", y="y", text="text", dx=12, align="left", size=13)
        with hm.Data({"row": [0]}):
            with hm.Calculate(v=hm.where(up == 1, 1000, 1)):
                hm.Points(x=1, y=hm.animate("v", duration=2000), size=7, fill="#547ba2")
                hm.Points(x=2, y=hm.tween("v", duration=2000), size=7, fill="#cf8955")
scene
`;export{e as default};
