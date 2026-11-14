const t=`import hmplot as hm

data = {"x": [1, 3, 2, 4, 2.5, 3], "y": [1, 1, 3, 3, 2, 2.5]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Hull(x="x", y="y"):
        hm.Polygon()
plot
`;export{t as default};
