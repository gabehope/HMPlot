"""Reference: GeoJSON's explicit key join retains the parent table's hover identity."""
from pathlib import Path
import json
import numpy as np
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
frame = pd.read_csv("data/district_rents.csv")
geo = json.loads(Path("data/districts.geojson").read_text())
edges = np.quantile(frame.median_rent_eur, np.linspace(0, 1, 6))
labels = [f"€{edges[i]:,.0f}–€{edges[i + 1]:,.0f}" for i in range(5)]
frame["rent_class"] = [labels[min(int(np.searchsorted(edges[1:-1], v, side="right")), 4)]
                       for v in frame.median_rent_eur]
def vertices(coords):
    if isinstance(coords[0], (int, float)):
        yield coords
    else:
        for child in coords:
            yield from vertices(child)
centers = {}
for feature in geo["features"]:
    points = np.asarray(list(vertices(feature["geometry"]["coordinates"])))
    centers[feature["properties"]["district"]] = (points.min(axis=0) + points.max(axis=0)) / 2
frame["lon"] = [centers[d][0] for d in frame.district]
frame["lat"] = [centers[d][1] for d in frame.district]
top = frame.nlargest(3, "median_rent_eur").district.tolist()
colors = hm.categorical(domain=labels, range=["#e3eef5", "#b6d4e3", "#79b2c8", "#3b8ca5", "#15566f"])
# Conditional literal colors currently fail at runtime. A fixed dark outline
# with reactive width/point size provides the same linked emphasis safely.
outline = "#213c4c"
tips = ["district", "median_rent_eur", "population"]
with hm.Scene() as chart:
    with hm.Data(frame, key="district"):
        with hm.Row(widths=[1.2, 1], gap=20):
            with hm.Plot(title="Median rent by district", coordinates="spherical",
                         projection="mercator", height=540, axes2d=False):
                regions = hm.GeoJSON(data=geo, feature_key="district", data_key="district",
                                     fill="rent_class", fill_scale=colors, hover=True,
                                     outline_color=outline,
                                     outline_width=hm.where(hm.view.hovered, 2.5, 0.8), tooltip=tips)
                with hm.Filter(where=hm.is_in("district", top)):
                    hm.Text(x="lon", y="lat", text="district", size=11, dy=-6,
                            color="#152d3a", box={"fill": "white", "opacity": 0.85, "padding": 2})
                hm.Legend(target=regions, channel="fill", label="Median rent", position="bottom")
            with hm.Plot(title="Rent against population", height=540,
                         x={"label": "Population"}, y={"label": "Median rent (€)"}):
                hm.Points(x="population", y="median_rent_eur", fill="rent_class", fill_scale=colors,
                          size=hm.where(hm.view.hovered, 12, 7), hover=True,
                          outline_color=outline, outline_width=hm.where(hm.view.hovered, 2.5, 0.8), tooltip=tips)
                with hm.Regression(x="population", y="median_rent_eur", band=False):
                    hm.Line(x="x", y="y", color="#c06c45", width=2)
hm.export_html(chart, "output/chart.html")
