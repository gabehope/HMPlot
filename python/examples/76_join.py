"""Joining two tables: each flight gets its origin airport's region.

Flights name their origin airport by code, and a second table gives each airport's region.
`hm.Join(data=airports, left_on="origin", right_on="code")` adds the region to every flight, so
the flights are colored by it and grouped on an axis by it, and a brush on a region brushes the
flights from it. A key the airports table repeats is an error; a flight whose airport is not in
it gets a missing region (`how="inner"` hides those flights instead).
"""
import numpy as np
import pandas as pd

import hmplot as hm

airports = pd.DataFrame({
    "code": ["SEA", "SFO", "LAX", "DEN", "SLC", "ORD", "MSP", "ATL", "JFK", "BOS"],
    "region": ["West", "West", "West", "Mountain", "Mountain", "Central", "Central", "East", "East", "East"],
})
rng = np.random.default_rng(3)
flights = pd.DataFrame({
    "origin": rng.choice(airports["code"], 500),
    "distance": rng.uniform(300, 4000, 500).round(),
    "delay": rng.normal(15, 20, 500).round(),
})

with hm.Scene() as scene:
    with hm.Data(flights):
        with hm.Join(data=airports, left_on="origin", right_on="code", fields=["region"]):
            with hm.Row():
                with hm.Plot(axes2d=True, x={"label": "distance (km)"}, y={"label": "delay (min)"}):
                    hm.Points(x="distance", y="delay", fill="region", size=2.5, respond="brushed")
                with hm.Plot(axes2d=True, y={"label": "delay (min)"}):
                    hm.Points(x="region", y="delay", fill="region", size=2.5, brush={"axis": "x"})
scene
