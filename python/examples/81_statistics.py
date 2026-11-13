"""Statistics: a fitted curve, ECDFs, density contours and Voronoi cells.

`hm.charts.Smooth(x=, y=, method=)` fits a line, a polynomial (`order`), or a log, exp or power curve,
with its 95% confidence band, on the GPU; under a brush (`hm.Filter(where="@brushed",
inactive="all")`) it refits to the brushed rows. `hm.charts.Ecdf(x=, by=)` draws each group's empirical
distribution as steps. `hm.charts.DensityBands(x=, y=)` fills the bands of a 2-D density, and
`hm.Voronoi` gives each point its cell, drawn by `hm.Polygon`, so hovering a cell highlights its
point. `hm.Regression`, `hm.Contour`, `hm.Hull` and `hm.Delaunay` are the transforms
underneath, for other marks.

Data: Palmer penguins (CC0; Horst, Hill and Gorman 2020). Run from the repository.
"""
import csv
from pathlib import Path

import hmplot as hm

with open(Path("static/data/penguins/penguins.csv")) as file:
    rows = list(csv.DictReader(file))
number = lambda value: float(value) if value else float("nan")
penguins = hm.Table({
    "species": [row["species"] for row in rows],
    "bill_length": [number(row["bill_length_mm"]) for row in rows],
    "bill_depth": [number(row["bill_depth_mm"]) for row in rows],
    "flipper": [number(row["flipper_length_mm"]) for row in rows],
    "mass": [number(row["body_mass_g"]) for row in rows],
})
species = hm.categorical(domain=["Adelie", "Chinstrap", "Gentoo"])

with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=380):
        with hm.Plot(data=penguins, height=340, axes2d=True,
                     x={"domain": [170, 235]}, y={"domain": [2500, 6500]}, title="Body mass against flipper length"):
            hm.Points(x="flipper", y="mass", fill="species", fill_scale=species, size=3, brush=True, respond="brushed")
            with hm.Filter(where="@brushed", inactive="all"):
                hm.charts.Smooth(x="flipper", y="mass", method="poly", order=2)
        with hm.Plot(data=penguins, height=340, axes2d=True, title="Body mass by species"):
            hm.charts.Ecdf(x="mass", by="species", color_scale=species)
        with hm.Plot(data=penguins, height=340, axes2d=True, title="Bill length against depth"):
            hm.charts.DensityBands(x="bill_length", y="bill_depth", thresholds=8, opacity=0.8)
            hm.Points(x="bill_length", y="bill_depth", fill="species", fill_scale=species, size=2)
        with hm.Plot(data=penguins, height=340, axes2d=True, title="Each penguin's Voronoi cell"):
            with hm.Voronoi(x="bill_length", y="bill_depth"):
                hm.Polygon(fill="species", fill_scale=species, opacity=0.3, outline_color="#ffffff", outline_width=0.5, hover=True, respond="hovered")
            hm.Points(x="bill_length", y="bill_depth", fill="species", fill_scale=species, size=2, respond="hovered")
scene
