const e=`import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6, 7, 8], "y": [3, 1, 4, 1, 5, 9, 2, 6]}
# Each press adds one to the button's value, so the Sample draws with a new seed.
with hm.Scene() as scene:
    hm.Button(name="draw")
    with hm.Plot(data=data, height=300, axes2d=True):
        with hm.Sample(size=4, seed=hm.input.draw):
            hm.Points(x="x", y="y")
scene
`;export{e as default};
