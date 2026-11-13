"""Grouped and stacked bars
Bars that share a category stack by default; arrange="group" sets them side by side."""
import hmplot as hm

data = {"region": ["North", "North", "South", "South", "West", "West"],
        "year": ["2024", "2025"] * 3, "sales": [12, 18, 9, 15, 21, 25]}

with hm.Row() as chart:
    with hm.Plot(data=data, height=320, title="Grouped", legend=True):
        hm.charts.Bar(x="region", y="sales", fill="year", arrange="group")
    with hm.Plot(data=data, height=320, title="Stacked", legend=True):
        hm.charts.Bar(x="region", y="sales", fill="year")
chart
