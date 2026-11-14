const n=`import hmplot as hm

data = {"x": [1, 3, 5, 7, 9], "y": [2, 4, 1, 5, 3]}
with hm.Scene() as scene:
    hm.ColorPicker(name="ink", value="#4f7dff")
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y", size=12, fill=hm.input.ink)
scene
`;export{n as default};
