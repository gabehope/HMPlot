"""Scatter with marginal distributions
Marginals aligns the panels and fits histogram counts; never set count domains to [0, 1] unless normalized."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(25)
data = {"Bill length (mm)": rng.normal(45, 5, 300),
        "Bill depth (mm)": rng.normal(17, 2, 300),
        "Species": rng.choice(["Adelie", "Chinstrap", "Gentoo"], 300)}
colors = hm.categorical(domain=["Adelie", "Chinstrap", "Gentoo"],
                        range=["#4477aa", "#ee6677", "#228833"])
with hm.Scene() as chart:
    hm.Title("Penguin bill measurements")
    with hm.charts.Marginals(data=data, x="Bill length (mm)", y="Bill depth (mm)",
                             fill="Species", fill_scale=colors, bins=20, height=500):
        hm.Legend(channel="fill", label="Species")
chart
