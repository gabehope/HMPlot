import hmplot as hm

sales = hm.Data({
    "fruit": ["apple", "pear", "apple", "plum", "pear", "apple"],
    "amount": [3, 5, 2, 4, 1, 6],
})
totals = sales.group_by("fruit").agg(total=hm.col.amount.sum())
with hm.Scene() as chart:
    with hm.Plot(height=300, axes2d=True):
        hm.charts.Bar(data=totals, x="fruit", y="total")
chart
