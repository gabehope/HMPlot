"""Reductions: one value from a column, broadcast over the rows.

mean, sum, count, min, max, std, var, median, mode, first, and last collapse a column.
They broadcast where they are used, take by= to reduce within each category, work as
Filter conditions, and set transform parameters such as a bin count or a bandwidth.
"""
import hmplot as hm
import numpy as np

rng = np.random.default_rng(11)
species = np.array(["Adelie", "Chinstrap", "Gentoo"])[rng.integers(0, 3, 300)]
bill = 40 + rng.normal(size=300) * 3 + (species == "Gentoo") * 8
penguins = {"species": species, "bill_length": bill}

# A standard score within each species, and the rows above their own group's mean.
with hm.Scene() as scene:
    with hm.Data(penguins):
        with hm.Plot(height=320, axes2d=True, legend=True) as scores:
            with hm.Calculate(
                z=(hm.col.bill_length - hm.mean("bill_length", by="species"))
                / hm.std("bill_length", by="species")
            ):
                hm.Points(x="bill_length", y="z", fill="species", size=3.5)

        with hm.Plot(height=320, axes2d=True) as above:
            with hm.Filter(where=hm.col.bill_length > hm.mean("bill_length")):
                # A bin count from the data: the square root rule, rounded.
                with hm.stats.Bin(x="bill_length", bins=hm.count("bill_length") ** 0.5):
                    hm.Rect(x0="x0", x1="x1", y0=0, y1="count", fill="#547ba2")

        # A rule name instead of a formula, and a bandwidth that follows the spread.
        with hm.Plot(height=320, axes2d=True) as shapes:
            hm.charts.Histogram(x="bill_length", bins="sturges", opacity=0.5)
            with hm.Density(x="bill_length", bandwidth=hm.std("bill_length") * 0.3):
                hm.Line(x="x", y="density", width=2, color="#cf8955")

scene
