"""Live statistics per route from brushed flights
flights.filter("@brushed").group_by("route").agg(...) computes each route's count and mean delay; routes.join(stats, on="route") gives them to the routes' own rows, so brushing resizes and recolors the routes."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(4)
names = ["SFO-JFK", "LAX-ORD", "SEA-ATL", "BOS-DEN", "MIA-PHX"]
flights = hm.Data({"route": rng.choice(names, 600), "delay": rng.gamma(2, 12, 600),
                   "distance": rng.uniform(300, 2600, 600)})
routes = hm.Data({"route": names, "x": [0, 1, 2, 3, 4], "y": [1, 0, 1, 0, 1]})
stats = flights.filter("@brushed").group_by("route").agg(flights=hm.count(), delay=hm.col.delay.mean())

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(height=300, title="Shift-drag to brush flights"):
            hm.Points(data=flights, x="distance", y="delay", size=3, brush=True, respond="brushed")
        with hm.Plot(height=300, title="Brushed flights per route"):
            hm.Points(data=routes.join(stats, on="route", fields=["flights", "delay"]),
                      x="x", y="y", size="flights", fill="delay", tooltip=["route", "flights", "delay"])
chart
