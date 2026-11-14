const t=`import hmplot as hm

data = {"value": [1.2, 2.5, 2.9, 3.1, 3.4, 3.8, 4.2, 4.4, 5.1, 6.3]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Density(x="value"):
        hm.Line(x="x", y="density")
plot
`;export{t as default};
