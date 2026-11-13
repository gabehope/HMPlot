import hmplot as hm

data = {
    "region": ["North", "North", "South", "South", "East", "East"],
    "product": ["A", "B", "A", "B", "A", "B"],
    "sales": [3, 2, 4, 1, 2, 3],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Stack(x="region", y="sales", series="product"):
        hm.charts.Bar(x="region", y="y1", baseline="y0", fill="product")
plot
