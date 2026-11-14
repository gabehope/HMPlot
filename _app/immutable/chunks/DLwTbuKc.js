const a=`import hmplot as hm

data = {"value": [1.2, 2.3, 2.8, 3.1, 3.4, 3.6, 3.9, 4.2, 4.5, 4.7, 5.1, 5.6, 6.4, 7.3]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.Histogram(x="value", bins=5)
plot
`;export{a as default};
