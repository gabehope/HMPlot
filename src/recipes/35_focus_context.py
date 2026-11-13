"""Zoom a line chart with a brush on an overview strip
hm.charts.FocusContext draws the series twice: drag across the strip below to zoom the chart above to those days; clear the brush (Escape) to see them all."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(3)
days = np.arange(730)
series = hm.Table({"day": days, "visits": 400 + 120 * np.sin(days / 15) + days / 3 + rng.normal(0, 25, len(days))})

with hm.Scene() as chart:
    hm.charts.FocusContext(data=series, x="day", y="visits", height=380, color="#2a6f97",
                           tooltip=["day", "visits"])
chart
