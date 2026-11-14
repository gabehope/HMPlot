const a=`import hmplot as hm

data = {"step": ["Start", "Sales", "Services", "Refunds", "Costs", "Tax"], "change": [120, 45, 20, -15, -60, -22]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.Waterfall(x="step", y="change")
    hm.Legend()
plot
`;export{a as default};
