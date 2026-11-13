"""Animate over time with a play button
Playback moves a value over time; a Filter keeps the rows of the current year."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(9)
years = np.repeat(np.arange(2000, 2021), 30)
data = {"year": years, "gdp": rng.lognormal(9, 1, years.size) * (1 + (years - 2000) / 20),
        "life": rng.normal(65, 8, years.size) + (years - 2000) / 3}

with hm.Scene() as chart:
    hm.Playback(name="year", label="Year", min=2000, max=2020, step=1, rate=2, loop=True)
    with hm.Plot(data=data, height=340, x={"transform": "log", "label": "GDP per capita"},
                 y={"domain": [40, 90], "label": "Life expectancy"}):
        with hm.Filter(where=hm.col.year == hm.input.year):
            hm.Points(x="gdp", y="life", size=8, fill="#2a9d8f")
chart
