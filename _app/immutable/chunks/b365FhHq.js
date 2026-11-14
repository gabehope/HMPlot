const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Mapping(x="x", y="y"):
        hm.Line()
        hm.Points()
plot
`;export{t as default};
