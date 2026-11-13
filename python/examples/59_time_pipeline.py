"""tween() and @time in the data pipeline.

A tweened column is data that moves: the histogram over it re-bins its rows on every frame
while they glide to new values. A Filter on @time lets points in as the view clock passes them,
100 a second.
"""
import numpy as np

import hmplot as hm

rng = np.random.default_rng(59)
n = 400


def draw(two_bumps):
    centers = np.where(np.arange(n) % 2, 0.25, 0.72) if two_bumps else np.full(n, 0.35)
    return np.clip(centers + rng.normal(0, 0.08, n), 0, 0.999)


table = hm.Table({"value": draw(False), "order": np.arange(n, dtype=float), "lane": -2 - 6 * rng.random(n)})
edges = [i / 40 for i in range(41)]

with hm.Scene() as scene:
    with hm.Data(table):
        with hm.Plot(height=340, axes2d=True, x={"domain": [0, 1]}, y={"domain": [-9, 60]}) as plot:
            with hm.Calculate(v=hm.tween("value", duration=1200)):
                # Explicit edges: the Bin re-runs on every frame of a glide without reading extents back.
                with hm.stats.Bin(x="v", bins=edges):
                    hm.Rect(x0="x0", x1="x1", y0=0, y1="count", fill="#4c78a8")
                with hm.Filter(where=hm.col.order < hm.view.time / 10):
                    hm.Points(x="v", y="lane", size=1.5, fill="#e45756")

# In a notebook, new values glide and the histogram follows:
#     table.update_columns(value=draw(True))
# and await plot.set_time(0, freeze=False) replays the reveal.
scene
