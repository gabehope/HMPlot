"""Histogram
Histogram bins a column (30 bins by default); bins= sets a count, edges or a rule."""
import numpy as np
import hmplot as hm

values = np.random.default_rng(1).normal(50, 12, 2000)

with hm.Plot(data={"score": values}, height=320, x={"label": "Score"}) as chart:
    hm.charts.Histogram(x="score", bins=40, fill="#4c78a8")
chart
