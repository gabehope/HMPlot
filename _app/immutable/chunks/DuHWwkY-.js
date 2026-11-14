const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.InputContext() as inputs:
    hm.Slider(name="size", min=1, max=10, value=4)
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y", size=hm.input.size)
inputs
`;export{t as default};
