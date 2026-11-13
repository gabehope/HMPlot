"""Earthquakes from a Parquet file: read only the columns a plot needs.

Ten years of magnitude 4.5+ earthquakes (USGS, 72,956 events) are stored as Parquet with five
columns. `hm.Table.from_parquet(path, columns=[...])` reads only the longitude, latitude and
magnitude; the year and depth columns are never read. Arrow and Parquet need pyarrow:
`pip install "hmplot[arrow]"`. The columns reach the browser as binary columns, as a NumPy
table's do.

In a Svelte app, a Provider reads the same file in the browser with HTTP range requests:
`<Provider url="/data/earthquakes/usgs-m45-2015-2024.parquet" format="parquet" columns={["lon", "lat", "mag"]}>`.

Data: U.S. Geological Survey earthquake catalog (public domain). Run from the repository.
"""
from pathlib import Path

import hmplot as hm

FILE = Path(__file__).resolve().parents[2] / "static/data/earthquakes/usgs-m45-2015-2024.parquet"

quakes = hm.Table.from_parquet(FILE, columns=["lon", "lat", "mag"])
colors = hm.continuous(domain=[4.5, 8], colormap=["#ffe066", "#e0245e", "#4361ee"])
with hm.Plot(data=quakes, height=360, axes2d=True, x={"domain": [-180, 180], "label": "longitude"},
             y={"domain": [-90, 90], "label": "latitude"}) as plot:
    hm.Points(x="lon", y="lat", fill="mag", fill_scale=colors, size=1, label="Earthquakes")
plot
