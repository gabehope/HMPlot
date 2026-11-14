const n=`import hmplot as hm

data = {"x": [1, 3, 5, 7, 9], "y": [2, 4, 1, 5, 3]}
with hm.Scene() as scene:
    hm.Slider(name="window", min=0, max=10, value=[2, 8])
    with hm.Plot(data=data, height=300, axes2d=True, x={"domain": hm.input.window}):
        hm.Points(x="x", y="y", size=12)
scene
`;export{n as default};
