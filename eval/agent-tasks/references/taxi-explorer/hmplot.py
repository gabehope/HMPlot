"""Reference: all million rows, GPU filtering and viewport-dependent hexagons."""
from pathlib import Path
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
frame = pd.read_parquet("data/pickups.parquet")
hour = (hm.input.hour == 24) | (hm.col.hour == hm.input.hour)
xlim = [float(frame.x_km.min()), float(frame.x_km.max())]
ylim = [float(frame.y_km.min()), float(frame.y_km.max())]
with hm.Scene(gap=12) as chart:
    hm.Slider(name="hour", label="Hour · 24 means all hours", min=0, max=24, step=1, value=24)
    with hm.Data(frame):
        with hm.Row(gap=20):
            with hm.Plot(title="Pickup density", height=500, aspect="equal",
                         x={"domain": xlim, "label": "East (km)"}, y={"domain": ylim, "label": "North (km)"}):
                visible = ((hm.col.x_km >= hm.view.view_x_min) & (hm.col.x_km <= hm.view.view_x_max)
                           & (hm.col.y_km >= hm.view.view_y_min) & (hm.col.y_km <= hm.view.view_y_max))
                with hm.Filter(where="@brushed", inactive="all"):
                    with hm.Filter(where=hour & visible):
                        with hm.stats.Hexbin(x="x_km", y="y_km",
                                             bounds={"x": xlim, "y": ylim},
                                             radius=(hm.view.view_x_max - hm.view.view_x_min) / 70):
                            cells = hm.Prism(x="x", y="y", width="width", depth="depth", rotation="rotation",
                                             shape="hexagon", z0=0, z1=0, fill="count",
                                             fill_scale=hm.continuous(transform="log", colormap="Viridis"),
                                             tooltip=["count"])
                            hm.Legend(target=cells, channel="fill", label="Pickups · log scale", position="right")
            with hm.Plot(title="Fare against distance", height=500,
                         x={"label": "Distance (km)"}, y={"label": "Fare (USD)"}):
                with hm.Filter(where=hour):
                    hm.Points(x="distance_km", y="fare_usd", size=1.1, fill="#3978a8",
                              opacity=0.045, brush=True, respond="brushed", selection_opacity=0.08)
        with hm.Plot(height=65, axes2d=False, interactive=False,
                     x={"domain": [0, 1]}, y={"domain": [0, 1]}):
            hm.Text(data={"x": [0.02], "y": [0.5], "text": ["Selected pickups:"]},
                    x="x", y="y", text="text", align="left", size=16)
            with hm.Filter(where="@brushed", inactive="all"):
                with hm.Filter(where=hour):
                    # One row of totals: no key, a count of 0 when nothing is selected.
                    with hm.Group():
                        hm.Text(x=0.24, y=0.5, text="count", format=",", align="left", size=20,
                                color="#21667f", box={"fill": "white", "padding": 2})
hm.export_html(chart, "output/chart.html")
