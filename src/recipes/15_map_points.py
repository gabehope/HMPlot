"""Points on a globe
In coordinates="spherical", x is longitude and y latitude; projection= picks the map."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(10)
data = {"lon": rng.uniform(-180, 180, 500), "lat": rng.uniform(-60, 70, 500), "mag": rng.uniform(4, 8, 500)}

with hm.Plot(data=data, coordinates="spherical", projection="orthographic", height=380) as chart:
    hm.Points(x="lon", y="lat", size="mag", size_scale=hm.continuous(range=[2, 9]), fill="mag", tooltip=["mag"])
chart
