const t=`import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6], "y": [3, 1, 4, 1, 5, 2]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Filter(where=hm.col.y > 2):
        hm.Points(x="x", y="y")
plot
`;export{t as default};
