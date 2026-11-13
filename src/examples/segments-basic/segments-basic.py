import hmplot as hm

start = [[0, 0], [1, 2], [2, 1]]
end = [[1, 1], [2, 3], [4, 0]]
with hm.Plot(height=300, axes2d=True) as plot:
    hm.Segments(start=start, end=end)
plot
