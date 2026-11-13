import hmplot as hm

data = {"region": ["North", "East", "South", "West"], "sales": [42, 18, 27, 13]}
with hm.Plot(data=data, height=300) as plot:
    hm.charts.Pie(value="sales", category="region")
plot
