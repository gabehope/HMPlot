import hmplot as hm

data = {
    "day": [1, 2, 3, 4, 1, 2, 3, 4],
    "stock": ["A", "A", "A", "A", "B", "B", "B", "B"],
    "price": [10, 12, 11, 14, 50, 52, 57, 60],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.stats.Normalize(field="price", method="first", by="stock"):
        hm.Line(x="day", y="normalized", series="stock")
plot
