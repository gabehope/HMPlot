import math
import hmplot as hm

days = list(range(120))
data = {"day": days, "price": [100 + 10 * math.sin(d / 8) + d / 6 for d in days],
        "volume": [50 + 30 * abs(math.cos(d / 5)) for d in days]}
# Two Plots over one x: zooming or panning either moves both; the axis is drawn once.
with hm.Scene() as chart:
    with hm.Data(data):
        with hm.Panels(x={"label": "Day"}):
            with hm.Plot(height=220, y={"label": "Price"}):
                hm.Line(x="day", y="price")
            with hm.Plot(height=120, y={"label": "Volume"}):
                hm.charts.Bar(x="day", y="volume", orientation="vertical")
chart
