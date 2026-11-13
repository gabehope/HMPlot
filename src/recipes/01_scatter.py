"""Scatter plot colored by category
Points colored by a column; legend=True on the Plot shows its key, and tooltip= lists fields on hover."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(0)
data = {"height": rng.normal(170, 10, 300), "weight": rng.normal(70, 12, 300),
        "group": rng.choice(["A", "B", "C"], 300)}

with hm.Plot(data=data, height=360, legend=True, x={"label": "Height (cm)"}, y={"label": "Weight (kg)"}) as chart:
    hm.Points(x="height", y="weight", fill="group", size=6, tooltip=["group", "height", "weight"])
chart
