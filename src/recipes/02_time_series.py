"""Lines over time, one per series
A datetime column makes a time axis; series= draws one line per value and color= a legend."""
import numpy as np
import pandas as pd
import hmplot as hm

days = pd.date_range("2025-01-01", periods=120, freq="D")
df = pd.concat([pd.DataFrame({"date": days, "city": city,
                              "temp": base + 8 * np.sin(np.arange(120) / 19) + np.random.default_rng(i).normal(0, 1, 120)})
                for i, (city, base) in enumerate([("Oslo", 2), ("Rome", 12), ("Cairo", 20)])])

with hm.Plot(data=df, height=360, legend=True, x={"label": "Date"}, y={"label": "Temperature (°C)"}) as chart:
    hm.Line(x="date", y="temp", series="city", color="city", width=2)
chart
