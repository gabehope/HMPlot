import numpy as np
import hmplot as hm

# 200,000 readings, one a minute from the start of 2024 (about 139 days): a daily cycle, a fast
# wobble and a slow drift. Adaptive detail draws the extremes across the plot's width, which keeps
# every peak at any zoom; Every point draws all the readings.
minute = np.arange(200_000, dtype=np.int64)  # int64: Pyodide's default int is 32-bit
readings = {
    "time": 1704067200000 + minute * 60_000,  # milliseconds since 1970, from 2024-01-01 UTC
    "value": np.sin(minute * 2 * np.pi / 1440) + 0.22 * np.sin(minute * 0.093) + 0.5 * np.sin(minute * 0.00021),
}

with hm.Scene() as scene:
    hm.Markdown("Scroll on the plot to zoom into a day, and back out to see every day again; drag the window on "
                "the minimap to move along.")
    with hm.Row(wrap=True, min_width=0):
        hm.Select(name="detail", label="Detail", options={"Adaptive detail": "uniform-x", "Every point": "random"})
    with hm.Plot(data=readings, schema={"time": {"type": "datetime", "unit": "ms", "timezone": "UTC"}},
                 height=320, axes2d=True, zoom_axis="x", y={"label": "value"}) as plot:
        hm.Line(x="time", y="value", sampling=hm.input.detail, width=1.25, color="#426c83")
    hm.Minimap(target=plot, height=90)
