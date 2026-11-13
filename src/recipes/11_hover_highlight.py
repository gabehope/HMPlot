"""Hover to highlight and show a tooltip
hover=True marks the row under the pointer (@hovered); respond="hovered" fades the others."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(7)
data = {"x": rng.uniform(0, 1, 80), "y": rng.uniform(0, 1, 80), "name": [f"item {i}" for i in range(80)]}

with hm.Plot(data=data, height=340) as chart:
    hm.Points(x="x", y="y", hover=True, respond="hovered", tooltip=["name", "x", "y"],
              size=hm.where("@hovered", 12, 7))
chart
