const a=`import hmplot as hm

data = {"metric": ["Revenue", "Renewals"], "actual": [65, 82], "goal": [80, 90],
        "poor": [50, 60], "fair": [70, 80], "good": [100, 100]}
with hm.Plot(data=data, height=250, axes2d=True, x={"label": "Percent of plan"}) as plot:
    hm.charts.BulletChart(x="actual", y="metric", target="goal", fields=["poor", "fair", "good"],
                          tick={"fill": "#20252b"})
plot
`;export{a as default};
