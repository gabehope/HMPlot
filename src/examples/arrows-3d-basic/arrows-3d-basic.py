import hmplot as hm

start = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
end = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
with hm.Plot(type="3d", height=300, axes3d=True) as plot:
    hm.Arrows3D(start=start, end=end, width=1)
plot
