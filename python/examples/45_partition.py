"""Partition: repeat the same marks once per group, all in one frame.

Facet gives every subset its own plot; Partition overlays them on shared axes, so a
per-group Density, fit, or summary is the same markup with one extra scope.
"""
import math

import hmplot as hm

species = ["Adelie", "Chinstrap", "Gentoo"]
centers = [39.0, 49.0, 48.0]
spreads = [2.5, 3.0, 3.5]


def noise(i, k):
    value = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return value - math.floor(value)


rows = []
for i in range(240):
    group = i % 3
    gauss = (noise(i, 1) + noise(i, 2) + noise(i, 3) - 1.5) * 2
    rows.append((species[group], centers[group] + gauss * spreads[group]))
penguins = {"species": [r[0] for r in rows], "bill_length": [r[1] for r in rows]}

with hm.Plot(data=penguins, height=380, axes2d=True, legend=True,
             x={"label": "Bill length (mm)"}, y={"label": "Density"}) as plot:
    with hm.Partition(by="species", legend_groups=True) as groups:
        with hm.Density(x="bill_length", resolution=128):
            hm.Area(x="x", upper="density", fill="species", opacity=0.35)
            hm.Line(x="x", y="density", color="species", width=2)

plot


async def show_groups():
    # Run after displaying the plot: `await show_groups()`.
    for group in await groups.groups():
        print(group["label"], group["marks"])
