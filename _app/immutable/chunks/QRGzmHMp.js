const a=`import hmplot as hm

data = {"x": [1, 2, 3, 4, 5], "lower": [1, 2, 1.5, 3, 2.5], "upper": [3, 4, 3.5, 5, 4.5]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Area(x="x", lower="lower", upper="upper", opacity=0.2)
plot
`;export{a as default};
