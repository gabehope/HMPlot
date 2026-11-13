"""Brushing a child frame's own axis strip.

Shift-drag in the plot brushes x and y of the root points. Shift-drag on the inset frame's
left tick strip brushes its `score` axis; that band is drawn only on the strip. A column
represented by several strips shows the same band on each, and editing any of them edits the
one constraint. Escape clears the most recently edited band.

Brush constraints published to Python carry `frame`, `axis`, and `origin` ("plot" or "strip").
"""
import numpy as np
import hmplot as hm

i = np.arange(120)
data = {
    "x": ((i * 37) % 100).astype(np.float32),
    "y": (50 + 40 * np.sin(i * 0.37)).astype(np.float32),
    "score": ((i * 71) % 100).astype(np.float32),
}

with hm.Plot(data=data, axes2d=True, height=420, x={"domain": [0, 100]}, y={"domain": [0, 100]}) as plot:
    hm.Points(x="x", y="y", brush=True, size=hm.where("@brushed", 4.5, 2.5))
    with hm.Frame(x={"domain": [0, 100], "range": [62, 96]}, y={"domain": [0, 100], "range": [8, 48]}):
        hm.Points(x="x", y="score", brush={"axis": "y"}, size=hm.where("@brushed", 4, 2), fill="#c0504d")

plot
