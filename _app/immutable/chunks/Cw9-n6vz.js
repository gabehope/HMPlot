const a=`import hmplot as hm

data = {
    "group": ["A", "A", "A", "A", "A", "B", "B", "B", "B", "B", "C", "C", "C", "C", "C"],
    "value": [3.0, 3.1, 3.1, 3.2, 3.5, 4.1, 4.2, 4.2, 4.3, 4.8, 2.5, 2.6, 2.6, 2.7, 3.0],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.Swarm(x="group", y="value")
plot
`;export{a as default};
