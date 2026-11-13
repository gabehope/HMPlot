"""Reference: shared time filter, native orthographic navigation, no invented land."""
from pathlib import Path
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
quakes = pd.read_csv("data/earthquakes.csv")
quakes["day"] = (pd.to_datetime(quakes.time, utc=True) - pd.Timestamp("2024-01-01", tz="UTC")).dt.total_seconds() / 86400
depth = hm.continuous(domain=[0, 700], colormap="Viridis")
with hm.Scene(gap=14) as chart:
    hm.Playback(name="day", label="Window end · day of 2024", min=30, max=366,
                value=180, step=0.25, rate=12, loop=True)
    with hm.Data(quakes):
        with hm.Filter(where=(hm.col.day > hm.input.day - 30) & (hm.col.day <= hm.input.day)):
            with hm.Row(widths=[1.3, 1], gap=20):
                with hm.Plot(title="Earthquakes by depth", coordinates="spherical",
                             projection="orthographic", projection_center=[135, 15], height=540):
                    points = hm.Points(x="lon", y="lat", size="magnitude",
                                       size_scale=hm.continuous(domain=[2, 9], range=[1.5, 8]),
                                       fill="depth_km", fill_scale=depth,
                                       opacity=0.15 + 0.85 * (hm.col.day - hm.input.day + 30) / 30,
                                       tooltip=["time", "magnitude", "depth_km"])
                    hm.Legend(target=points, channel="fill", label="Depth (km)")
                with hm.Plot(title="Depth (km)", height=540,
                             x={"label": "Depth (km)", "domain": [0, 700]},
                             y={"label": "Earthquakes"}):
                    hm.charts.Histogram(x="depth_km", bins=list(range(0, 721, 20)), fill="#3983be")
hm.export_html(chart, "output/chart.html")
