const a=`import hmplot as hm

data = {"x": [0, 2, 0, 2], "y": [0, 0, 2, 2], "value": [1, 3, 2, 4]}
with hm.Plot(data=data, type="3d", height=300, axes3d=True) as plot:
    hm.Prism(x="x", y="y", z0=0, z1="value")
plot
`;export{a as default};
