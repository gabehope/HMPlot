const n=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
# Play shows the points up to x = until, one more each second.
with hm.Scene() as scene:
    hm.Playback(name="until", min=1, max=4, step=1)
    with hm.Plot(data=data, height=300, axes2d=True, x={"domain": [0, 5]}, y={"domain": [0, 5]}):
        with hm.Filter(where=hm.col.x <= hm.input.until):
            hm.Points(x="x", y="y")
scene
`;export{n as default};
