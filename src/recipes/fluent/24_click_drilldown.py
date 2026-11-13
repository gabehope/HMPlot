"""Click drilldown with aggregate bars
Group each view from the source rows: sales.group_by("region") for the clickable bars, and sales.filter(focus).group_by("product") for the drilldown.
Click a region to replace the selection, click it again or the background to restore all.
Shift/Meta/Ctrl clicks toggle membership. Everything runs in standalone HTML without callbacks."""
import hmplot as hm

sales = hm.Data({"region": ["North"] * 6 + ["South"] * 6,
                 "product": ["Hardware", "Software", "Services"] * 4,
                 "revenue_k": [10, 20, 30, 4, 5, 6, 40, 50, 60, 7, 8, 9]})
focus = hm.selection()
by_region = sales.group_by("region").agg(revenue=hm.col.revenue_k.sum())
by_product = sales.filter(focus, inactive="all").group_by("product").agg(revenue=hm.col.revenue_k.sum())

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(height=320, title="Revenue by region",
                     x={"scale": hm.categorical(domain=["North", "South"])}):
            hm.charts.Bar(data=by_region, x="region", y="revenue", select=focus, respond=False)
        with hm.Plot(height=320, title="Revenue by product",
                     x={"scale": hm.categorical(domain=["Hardware", "Software", "Services"])}):
            hm.charts.Bar(data=by_product, x="product", y="revenue")
    # hm.export_html(chart, "chart.html") also keeps this interaction, without a Python kernel.
chart
