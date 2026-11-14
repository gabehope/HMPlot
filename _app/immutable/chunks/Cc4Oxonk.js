const t=`import hmplot as hm

data = {
    "group": ["A", "A", "A", "A", "A", "B", "B", "B", "B", "B", "C", "C", "C", "C", "C"],
    "value": [2.1, 2.9, 3.4, 3.8, 5.2, 4.4, 5.1, 5.6, 6.3, 9.8, 3.1, 3.5, 3.9, 4.1, 4.6],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.BoxPlot(x="group", y="value")
plot
`;export{t as default};
