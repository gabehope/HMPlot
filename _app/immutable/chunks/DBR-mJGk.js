const a=`import hmplot as hm

data = {"value": [3, 1, 4, 1, 5, 9, 2, 6]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.Ecdf(x="value")
plot
`;export{a as default};
