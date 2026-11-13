"""Shape as a data channel, and custom point shapes.

``shape`` names a column like ``fill`` does: each category gets a symbol, and a legend
explains it. Register polygons with ``hm.register_shape`` (vertices in the unit square [-1, 1],
y up, or an SVG path using only M, L, and Z) and use them anywhere a shape name works.
"""
import math

import hmplot as hm

hm.register_shape("kite", [[0, 1], [0.7, 0.2], [0, -1], [-0.7, 0.2]])
hm.register_shape("bolt", "M0.2 1 L-0.6 -0.1 L-0.05 -0.1 L-0.2 -1 L0.6 0.1 L0.05 0.1 Z")
hm.register_shape("house", [[0, 1], [0.9, 0.2], [0.9, -1], [-0.9, -1], [-0.9, 0.2]])


def noise(i, k):
    v = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return v - math.floor(v)


kinds, regions = ["Station", "Buoy", "Shelter"], ["North", "Coast", "Valley"]
data = {
    "kind": [kinds[i % 3] for i in range(90)],
    "region": [regions[int(noise(i, 3) * 3)] for i in range(90)],
    "x": [100 * noise(i, 1) for i in range(90)],
    "y": [100 * noise(i, 2) for i in range(90)],
}
symbols = hm.categorical(domain=kinds, range=["kite", "bolt", "house"])

with hm.Scene() as scene:
    # Built-in symbols chosen automatically from the column.
    with hm.Plot(data=data, height=320, axes2d=True):
        points = hm.Points(x="x", y="y", shape="region", fill="region", size=7)
        hm.Legend(target=points, channel="shape", label="Region", position="right")
    # Custom polygons through a shape scale; color from a different column.
    with hm.Plot(data=data, height=320, axes2d=True):
        points = hm.Points(x="x", y="y", shape="kind", shape_scale=symbols, fill="region", size=9)
        hm.Legend(target=points, channel="shape", label="Kind", position="right")
        hm.Legend(target=points, channel="fill", label="Region", position="right")
    # One shape name per row.
    with hm.Plot(height=200, axes2d=True):
        hm.Points(x=[1, 2, 3], y=[1, 1, 1], shape=["kite", "bolt", "house"], size=15)

scene
