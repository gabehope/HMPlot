"""Facet fields and pairs: one cell per variable.

hm.Facet(fields=[...]) makes one cell per field over the same rows. Inside a cell, the column
"value" is that cell's field and "field" holds its name, so the marks are written once: y="value"
plots temperature in one cell and rainfall in the next. Each field keeps its own y domain
(scales="field", the default here) while columns of the table, such as time, stay shared.

A list lays the cells along columns; fields={"row": [...]} stacks them. A row or column split
can take the other dimension: fields=[...] with row="species" is a grid of fields by species,
where a field keeps one domain across the species.

hm.Facet(pairs=[...]) is a scatterplot matrix: each cell's "x" and "y" are its two fields.
triangle="lower" keeps the cells below the diagonal and diagonal=False drops the diagonal;
pairs={"x": [...], "y": [...]} makes a rectangular matrix. A field shares one domain on x and y.
"""
import math

import hmplot as hm

n = 48
data = {
    "time": [i / 4 for i in range(n)],
    "temp": [10 + 8 * math.sin(i / 8) for i in range(n)],
    "rain": [200 + 150 * math.cos(i / 12) for i in range(n)],
    "species": [["Adelie", "Gentoo", "Chinstrap"][i % 3] for i in range(n)],
    "bill": [40 + 6 * (i % 3) + 3 * math.sin(i * 1.7) for i in range(n)],
    "depth": [17 - (i % 3) + math.cos(i * 2.3) for i in range(n)],
    "mass": [3700 + 700 * (i % 3) + 300 * math.sin(i * 0.9) for i in range(n)],
}

with hm.Scene() as scene:
    # Small multiples of different variables: x (time) is shared, y is each cell's field.
    with hm.Plot(data=data, height=260, axes2d=True):
        with hm.Facet(fields=["temp", "rain"]):
            hm.Line(x="time", y="value", width=2)
    # Fields by species: a column per field, a row per species. Shift-drag on a cell's
    # y axis brushes that field.
    with hm.Plot(data=data, height=420, axes2d=True):
        with hm.Facet(fields=["bill", "depth", "mass"], row="species"):
            hm.Points(x="time", y="value", color="species", size=2.5, brush={"axis": "y"})
    # A lower-triangle scatterplot matrix.
    with hm.Plot(data=data, height=480, axes2d=True):
        with hm.Facet(pairs=["bill", "depth", "mass"], triangle="lower"):
            hm.Points(x="x", y="y", color="species", size=2.5)

scene
