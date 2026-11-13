import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2], "z": [2, 4, 1, 3]}
with hm.Plot(data=data, type="3d", height=300, axes3d=True,
    lights=[hm.light("hemisphere", ground_color="#4a5a70")]) as plot:
    hm.Points3D(x="x", y="y", z="z", size=25, lit=True)
plot
