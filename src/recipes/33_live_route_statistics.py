"""Live statistics per route from brushed flights
A Group of the brushed flights computes each route's count and mean delay; hm.Join(data=stats) gives them to the routes' own rows, so brushing resizes and recolors the routes."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(4)
names = ["SFO-JFK", "LAX-ORD", "SEA-ATL", "BOS-DEN", "MIA-PHX"]
flights = hm.Table({"route": rng.choice(names, 600), "delay": rng.gamma(2, 12, 600),
                    "distance": rng.uniform(300, 2600, 600)})
routes = hm.Table({"route": names, "x": [0, 1, 2, 3, 4], "y": [1, 0, 1, 0, 1]})

with hm.Scene() as chart:
    with hm.Data(flights):
        with hm.Filter(where="@brushed"):
            stats = hm.Group(by="route", columns={"flights": hm.count(), "delay": hm.mean("delay")})
    with hm.Row():
        with hm.Plot(data=flights, height=300, title="Shift-drag to brush flights"):
            hm.Points(x="distance", y="delay", size=3, brush=True, respond="brushed")
        with hm.Plot(data=routes, height=300, title="Brushed flights per route"):
            with hm.Join(data=stats, on="route", fields=["flights", "delay"]):
                hm.Points(x="x", y="y", size="flights", fill="delay", tooltip=["route", "flights", "delay"])
chart
