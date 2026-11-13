"""A crosshair over a time series, with a threshold and event rules.

`hm.charts.Crosshair()` follows the pointer with a rule each way and a readout of each value, finer
than the ticks: a date with its time of day here. `hm.charts.RuleY(y=75)` draws a threshold across the
frame, and `hm.charts.RuleX(x="date")` under a second table one rule per event, labeled at the top of
the frame by a Text at `y="@view_y_max"`. Rules never widen the axes, and the pointer is
`"@pointer_x"` and `"@pointer_y"` in any channel or expression.
"""
import numpy as np
import pandas as pd

import hmplot as hm

dates = pd.date_range("2026-01-01", periods=120, freq="D")
rng = np.random.default_rng(7)
steps = rng.normal(0, 1.5, 120) + np.where((np.arange(120) >= 33) & (np.arange(120) < 45), 1.2, 0)
series = pd.DataFrame({"date": dates, "load": 60 + np.cumsum(steps)})
events = pd.DataFrame({"date": pd.to_datetime(["2026-02-03", "2026-03-18"]), "name": ["Release", "Outage"]})

with hm.Plot(data=series, height=340, axes2d=True, y={"label": "load (%)"}) as plot:
    hm.Line(x="date", y="load", color="#547ba2", width=2)
    hm.charts.RuleY(y=75, color="#cf8955", dash=True)
    with hm.Data(events):
        hm.charts.RuleX(x="date", color="#8a949e")
        hm.Text(x="date", y="@view_y_max", text="name", dx=4, dy=10, align="left", legend=False)
    hm.charts.Crosshair()
plot
