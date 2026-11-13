"""Reference: aggregate live flights, then join static endpoint geometry."""
from pathlib import Path
import numpy as np
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
airports = pd.read_csv("data/airports.csv").reset_index(drop=True)
flights = pd.read_parquet("data/flights.parquet")
index = {code: i for i, code in enumerate(airports.code)}
flights["origin_id"] = flights.origin.map(index)
flights["dest_id"] = flights.dest.map(index)
flights["route"] = flights.origin + " → " + flights.dest
routes = flights[["route", "origin", "dest", "origin_id", "dest_id"]].drop_duplicates("route").copy()
coords = airports.set_index("code")
routes["start"] = coords.loc[routes.origin, ["lon", "lat"]].to_numpy().tolist()
routes["end"] = coords.loc[routes.dest, ["lon", "lat"]].to_numpy().tolist()
geometry = {"route": routes.route.tolist(), "start": routes.start.tolist(), "end": routes.end.tolist()}
airport_info = {"origin": airports.code.tolist(), "name": airports.name.tolist(),
                "lon": airports.lon.to_numpy(), "lat": airports.lat.to_numpy()}
delay_colors = hm.continuous(domain=[-30, 30], colormap="RdBu")
connected = (hm.col.origin_id == hm.col.focus_origin) | (hm.col.dest_id == hm.col.focus_origin)
with hm.Scene() as chart:
    with hm.Data(flights):
        with hm.Row(widths=[2.2, 1], gap=24):
            with hm.Plot(title="Flight network", height=560, coordinates="spherical",
                         projection="equal-earth", axes2d=False):
                with hm.Filter(where="@brushed", inactive="all"):
                    # Materialize interaction-dependent values before aggregation: the
                    # pinned build does not resolve virtual state fields after Group/Join.
                    with hm.Calculate(columns={"focus_origin": hm.max("origin_id", where=hm.view.hovered),
                                               "hover_active": hm.any(hm.view.hovered)}):
                        with hm.Group(by=["route", "origin_id", "dest_id"],
                                      columns={"mean_delay": hm.mean("delay_min"),
                                               "focus_origin": hm.first("focus_origin"),
                                               "hover_active": hm.first("hover_active")}):
                            with hm.Join(data=geometry, on="route"):
                                arcs = hm.Segments(start="start", end="end", interpolation="great-circle",
                                                   width="count", width_scale=hm.continuous(range=[0.5, 4]),
                                                   color="mean_delay", color_scale=delay_colors,
                                                   opacity=hm.where(hm.col.hover_active, hm.where(connected, 0.9, 0.035), 0.5),
                                                   tooltip=["route", "count", "mean_delay"])
                    with hm.Group(by=["origin", "origin_id"]):
                        with hm.Join(data=airport_info, on="origin"):
                            hm.Points(x="lon", y="lat", size="count",
                                      size_scale=hm.continuous(range=[5, 16]), fill="#214a64",
                                      outline_color="white", outline_width=0.8, hover=True,
                                      tooltip=["name", {"field": "count", "label": "Departures"}])
                hm.Legend(target=arcs, channel="color", label="Mean delay (min)", position="bottom")
            with hm.Plot(title="Departure hour", height=560,
                         x={"domain": [0, 24], "label": "Departure hour"}, y={"label": "Flights"}):
                hm.charts.Histogram(x="dep_hour", bins=np.arange(25).tolist(),
                                    fill="#4384ad", brush=True, tooltip=True)
hm.export_html(chart, "output/chart.html")
