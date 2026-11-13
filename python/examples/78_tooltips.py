"""Tooltips: the nearest row's values, and every series at the pointer's date.

`tooltip=` on a mark shows the nearest row's values in a box beside the pointer, within 16 pixels,
so small points are easy to reach: `True` lists the columns the mark's channels read, and a list
picks the fields, each a column name or `{"field", "label", "format"}`; `"@tooltip"` is 1 on the
row the box shows, so `hm.where("@tooltip", 4.5, 2.5)` enlarges it. On a Plot, `tooltip=` is
the default of its marks, and `tooltip={"mode": "x"}` lists every series' value at the pointer's
x in one box, with a marker on each line; `hm.charts.Crosshair(axes="x")` draws the rule.
"""
import numpy as np
import pandas as pd

import hmplot as hm

rng = np.random.default_rng(4)
species = rng.choice(["Adelie", "Chinstrap", "Gentoo"], 300)
offset = pd.Series(species).map({"Adelie": 0, "Chinstrap": 1, "Gentoo": 2}).to_numpy()
penguins = pd.DataFrame({
    "species": species,
    "island": rng.choice(["Biscoe", "Dream", "Torgersen"], 300),
    "bill": (38 + offset * 5 + rng.normal(0, 2, 300)).round(1),
    "mass": (3500 + offset * 700 + rng.normal(0, 300, 300)).round(),
})
dates = pd.date_range("2026-01-01", periods=90, freq="D")
prices = pd.concat([
    pd.DataFrame({"date": dates, "price": (100 - k * 15 + np.cumsum(rng.normal(0, 1.5, 90))).round(2), "ticker": ticker})
    for k, ticker in enumerate(["North", "East", "West"])
])

with hm.Scene() as scene:
    with hm.Row():
        with hm.Plot(data=penguins, height=320, axes2d=True):
            hm.Points(x="bill", y="mass", fill="species", size=hm.where("@tooltip", 4.5, 2.5),
                             tooltip=["island", "bill", {"field": "mass", "label": "body mass (g)", "format": ",.0f"}])
        with hm.Plot(data=prices, height=320, axes2d=True, tooltip={"mode": "x"}):
            hm.Line(x="date", y="price", series="ticker", color="ticker", width=2)
            hm.charts.Crosshair(axes="x", readout=False)
scene
