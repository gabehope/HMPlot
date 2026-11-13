"""Pie and donut charts
Pie draws one sector per row (or category), sized by value; inner_radius makes a donut."""
import hmplot as hm

data = {"browser": ["Chrome", "Safari", "Firefox", "Edge", "Other"], "share": [64, 19, 4, 5, 8]}

with hm.Row() as chart:
    with hm.Plot(data=data, height=300, title="Pie", legend=True):
        hm.charts.Pie(category="browser", value="share")
    with hm.Plot(data=data, height=300, title="Donut", legend=True):
        hm.charts.Pie(category="browser", value="share", inner_radius=0.55)
chart
