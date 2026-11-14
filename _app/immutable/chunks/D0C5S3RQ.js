const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2], "z": [2, 4, 1, 3]}
with hm.Plot(data=data, type="3d", height=300, axes3d=True,
    lights=[hm.light("ambient", intensity=0.4),
            hm.light("directional", position=[1, 2, 3])]) as plot:
    hm.Points3D(x="x", y="y", z="z", size=25, lit=True)
plot
`;export{t as default};
