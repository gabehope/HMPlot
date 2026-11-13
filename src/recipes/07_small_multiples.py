"""Small multiples
Facet repeats its Plot once per value of a column; the cells share their axes."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(4)
data = {"x": rng.uniform(0, 10, 300), "region": rng.choice(["North", "South", "East"], 300)}
data["y"] = data["x"] * 2 + rng.normal(0, 3, 300)

with hm.Facet(data=data, column="region") as chart:
    with hm.Plot(height=260):
        hm.Points(x="x", y="y", size=4)
chart
