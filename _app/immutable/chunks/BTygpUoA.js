const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6], "y": [2, 3, 5, 4, 6, 7]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Regression(x="x", y="y"):
        hm.Line(x="x", y="y")
plot
`;export{t as default};
