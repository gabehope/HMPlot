const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2], "z": [2, 4, 1, 3]}
with hm.Plot(data=data, type="3d", height=300, axes3d=True,
    lights=[hm.light("point", position=[0, 0, 0], decay=0)]) as plot:
    hm.Points3D(x="x", y="y", z="z", size=25, lit=True)
    # At the center of the plot's box; decay=0 keeps it from fading over the box's 100 units.
plot
`;export{t as default};
