import hmplot as hm

fill = [
    [0, 1, 2, 1],
    [1, 3, 4, 2],
    [2, 4, 3, 1],
]
with hm.Plot(height=300) as plot:
    hm.Heatmap(fill=fill)
plot
