"""Linked brushing across plots
brush=True lets a Shift-drag select rows (@brushed); a Filter in another plot keeps them."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(6)
data = {"x": rng.normal(size=2000), "y": rng.normal(size=2000), "value": rng.gamma(2, 2, 2000)}

with hm.Data(data) as chart:
    with hm.Row():
        with hm.Plot(height=320, title="Shift-drag to brush"):
            hm.Points(x="x", y="y", size=3, brush=True, respond="brushed")
        with hm.Plot(height=320, title="Brushed rows"):
            with hm.Filter(where="@brushed"):
                hm.charts.Histogram(x="value", bins=30)
chart
