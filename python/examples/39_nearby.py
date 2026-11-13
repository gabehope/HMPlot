"""Nearby: highlight every observation near the pointer, including overplotted ones.

`nearby=True` uses a 24-pixel circle. For a time series, `axis="x"` with `units="data"`
selects the observations within half a time unit of the pointer's x position, whatever
their y. `@nearby` is 1 on those rows and `@any_nearby` is 1 on every row while any row
is near, so the rest can fade only while the pointer is over the data.
"""
import numpy as np
import hmplot as hm

t = np.arange(0, 200, dtype=np.float32)
readings = {
    "t": np.concatenate([t, t, t]),
    "value": np.concatenate([np.sin(t / 12), np.cos(t / 15), np.sin(t / 7) * 0.5]).astype(np.float32),
    "series": np.repeat(["a", "b", "c"], t.size),
}

with hm.Plot(data=readings, axes2d=True, height=360) as plot:
    hm.Points(
        x="t", y="value", fill="series",
        nearby={"axis": "x", "units": "data", "radius": 0.5},
        size=hm.where("@nearby", 6, 2),
        opacity=hm.where("@any_nearby", hm.where("@nearby", 1.0, 0.3), 1.0),
    )

plot
