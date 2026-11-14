const t=`import hmplot as hm

# One arrow per row, from its start to its end.
start = [[0, 0], [2, 3], [4, 1]]
end = [[1.5, 2], [3.5, 3], [3, 0]]
with hm.Plot(height=300, axes2d=True) as plot:
    hm.charts.Arrows(start=start, end=end)
plot
`;export{t as default};
