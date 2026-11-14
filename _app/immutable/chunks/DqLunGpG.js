const t=`import hmplot as hm

data = {"x": [1, 2, 2, 3, 3, 4, 5], "y": [2, 1, 3, 2, 4, 3, 4]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Density(x="x", y="y"):
        with hm.Contour(field="density"):
            hm.Segments(start="start", end="end")
plot
`;export{t as default};
