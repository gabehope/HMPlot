"""Apple prices against the same series shifted by 365 days.

Adapted from https://svelteplot.dev/examples/difference/apple-yoy.
Paste into a notebook; `plot` displays the chart. Requires pandas and NumPy.
"""
import hmplot as hm
import numpy as np
import pandas as pd

prices = pd.read_csv("https://svelteplot.dev/data/aapl.csv", parse_dates=["Date"])
days = prices["Date"].to_numpy().astype("datetime64[D]").astype(float)
close = prices["Close"].to_numpy()

# Compare both lines at their combined dates, keeping only their overlap.
time = np.union1d(days, days + 365)
time = time[(time >= days[0] + 365) & (time <= days[-1])]
current = np.interp(time, days, close)
previous = np.interp(time - 365, days, close)
data = pd.DataFrame({"date": pd.to_datetime(time, unit="D"),
                     "current": current, "previous": previous})

with hm.Plot(data=data, width=800, height=350, axes2d=True, axis_frame=False,
             x={"label": "Date", "grid": "major", "arrow": "none"},
             y={"label": "Close", "step": 20, "grid": "major", "arrow": "none"}) as plot:
    upper = hm.maximum("current", "previous")
    hm.Area(x="date", lower="previous", upper=upper, fill="#10b981", opacity=1)
    hm.Area(x="date", lower="current", upper=upper, fill="#f43f5e", opacity=1)
    hm.Line(x="date", y="current", color="#334155", width=1.5)
plot

# Optional outside a notebook:
# hm.export_png(plot, "apple-yoy.png")
