"""Click drilldown with aggregate bars
Keep source rows: Group each branch separately, with Filter before the target Group.
Click a region to replace the selection, click it again or the background to restore all.
Shift/Meta/Ctrl clicks toggle membership. Everything runs in standalone HTML without callbacks."""
import hmplot as hm

sales = {"region": ["North"] * 6 + ["South"] * 6,
         "product": ["Hardware", "Software", "Services"] * 4,
         "revenue_k": [10, 20, 30, 4, 5, 6, 40, 50, 60, 7, 8, 9]}
focus = hm.selection()
with hm.Data(sales) as chart:
    with hm.Row():
        with hm.Plot(height=320, title="Revenue by region",
                     x={"scale": hm.categorical(domain=["North", "South"])}):
            with hm.Group(by="region", columns={"revenue": hm.sum("revenue_k")}):
                hm.charts.Bar(x="region", y="revenue", select=focus, respond=False)
        with hm.Plot(height=320, title="Revenue by product",
                     x={"scale": hm.categorical(domain=["Hardware", "Software", "Services"])}):
            with hm.Filter(where=focus, inactive="all"):
                with hm.Group(by="product", columns={"revenue": hm.sum("revenue_k")}):
                    hm.charts.Bar(x="product", y="revenue")
# hm.export_html(chart, "chart.html") also keeps this interaction, without a Python kernel.
chart
