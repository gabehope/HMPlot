const a=`import hmplot as hm

data = {"category": ["A", "B", "C", "D", "E"], "value": [18, 31, 12, 44, 26]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.Lollipop(x="category", y="value")
plot
`;export{a as default};
