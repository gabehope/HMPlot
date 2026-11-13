"""Many events, one point per location
Group repeated coordinates before drawing; brushes still select the contributing events. Separate selections let the map filter delays while a delay brush highlights locations."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(24)
# Join location metadata onto the events first. There are 200,000 events, but only 40 points.
origin = np.arange(200_000) % 40
flights = hm.Data({"origin": origin, "lon": -120 + (origin % 8) * 6,
                   "lat": 28 + (origin // 8) * 5,
                   "name": np.array([f"Airport {i}" for i in origin]),
                   "delay": rng.normal(origin * 2, 15)})
airports, delays = hm.selection(), hm.selection()
locations = flights.group_by("origin", "lon", "lat", "name").agg(departing_flights=hm.count())
from_brushed = flights.filter(airports, inactive="all")

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(height=320, title="Brush airports", x={"label": "Longitude"}, y={"label": "Latitude"}):
            hm.Points(data=locations, x="lon", y="lat", size=8, brush={"selection": airports},
                      respond=[airports, delays], tooltip=["name", "departing_flights"])
        with hm.Plot(height=320, title="Delays from brushed airports", x={"label": "Delay (minutes)"}, y={"label": "Flights"}):
            hm.charts.Histogram(data=from_brushed, x="delay", bins=30, brush={"selection": delays})
chart
