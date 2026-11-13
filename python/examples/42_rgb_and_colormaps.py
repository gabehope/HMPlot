"""RGB colors from data and custom colormaps.

The first plot colors each point from red, green, and blue columns (integers are 0-255,
floats 0-1). The second uses a custom diverging colormap and the third a colormap whose
positions keep its strongest colors for the top of the domain. The theme sets the default
colormap for the last plot, which has no explicit one.
"""
import numpy as np

import hmplot as hm

columns, rows = 40, 24
c, r = np.meshgrid(np.arange(columns), np.arange(rows))
grid = {
    "x": c.ravel(), "y": r.ravel(),
    "red": (c.ravel() / (columns - 1) * 255).astype(np.uint8),
    "green": (r.ravel() / (rows - 1) * 255).astype(np.uint8),
    "blue": np.full(columns * rows, 140, dtype=np.uint8),
}

x, y = np.meshgrid(np.linspace(-3, 3, 30), np.linspace(-3, 3, 30))
field = {"x": x.ravel(), "y": y.ravel(), "value": (np.sin(x) * np.cos(y)).ravel()}
diverging = hm.continuous(domain=[-1, 1], colormap=["#2166ac", "#f7f7f7", "#b2182b"])
alert = hm.continuous(domain=[-1, 1], colormap=hm.colormap(
    ["#e8eef4", "#9ab0c4", "#f2a900", "#d7301f"], positions=[0, 0.8, 0.9, 1]))

with hm.Scene() as scene:
    with hm.Plot(data=grid, height=320, axes2d=True, tone_mapping=0):
        hm.Points(x="x", y="y", fill=hm.rgb("red", "green", "blue"), shape="square", size=5)
    for scale, label in [(diverging, "Diverging"), (alert, "Alert levels")]:
        with hm.Plot(data=field, height=300, axes2d=True):
            points = hm.Points(x="x", y="y", fill="value", fill_scale=scale, shape="square", size=4.5)
            hm.Legend(target=points, channel="fill", label=label, position="right")
    with hm.Theme(value=hm.create_theme(colormap="Magma")):
        with hm.Plot(data=field, height=300, axes2d=True):
            hm.Points(x="x", y="y", fill="value", shape="square", size=4.5)

scene
