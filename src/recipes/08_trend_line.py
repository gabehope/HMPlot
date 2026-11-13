"""Scatter with a fitted trend line and confidence band
Smooth fits y on x (a line by default; method="poly" with order=, "log", "exp", "pow")."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(5)
x = rng.uniform(0, 10, 200)
data = {"x": x, "y": 3 + 1.5 * x + rng.normal(0, 2, 200)}

with hm.Plot(data=data, height=360) as chart:
    hm.Points(x="x", y="y", size=4, fill="#9aa5b1")
    hm.charts.Smooth(x="x", y="y", color="#d1495b")
chart
