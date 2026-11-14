const t=`import hmplot as hm

data = {"x": [3, 1, 4, 2, 5], "y": [2, 1, 4, 3, 5]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Sort(by="x"):
        hm.Line(x="x", y="y")
plot
`;export{t as default};
