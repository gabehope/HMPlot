"""Legends: merged category swatches, a size ramp, and one legend for a facet grid.

One column drives both fill and shape, so the species legend draws colored symbols.
Body mass is numeric, so its legend is a ramp of sample sizes. In the facet grid the
same mark is drawn in every cell but listed once, and hiding a species hides it in
every cell.
"""
import math

import hmplot as hm


def noise(i, k):
    v = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return v - math.floor(v)


species = ["Adelie", "Gentoo", "Chinstrap"]
islands = ["Biscoe", "Dream", "Torgersen"]
rows = [
    {
        "species": species[i % 3],
        "island": islands[int(noise(i, 5) * 3)],
        "bill": 38 + 6 * (i % 3) + 5 * noise(i, 1),
        "flipper": 185 + 12 * (i % 3) + 14 * noise(i, 2),
        "mass": 3000 + 900 * (i % 3) + 1500 * noise(i, 3),
    }
    for i in range(180)
]
data = {key: [row[key] for row in rows] for key in rows[0]}
mass = hm.continuous(domain=[3000, 6300], range=[3, 14])

with hm.Scene() as scene:
    with hm.Plot(data=data, height=380, axes2d=True):
        points = hm.Points(x="bill", y="flipper", fill="species", shape="species",
                                  size="mass", size_scale=mass)
        hm.Legend(target=points, channel="fill", label="Species", position="right")
        hm.Legend(target=points, channel="size", label="Body mass (g)", position="right")
    # One legend around the grid; legend="cell" would restore one per cell.
    with hm.Facet(data=data, column="island", legend={"position": "bottom"}):
        with hm.Plot(height=220, axes2d=True):
            hm.Points(x="bill", y="flipper", fill="species", size="mass", size_scale=mass,
                             label="Penguins")

scene
