"""3D scatter
type="3d" gives a camera the viewer turns; x, y and z map to the three axes."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(11)
data = {"x": rng.normal(size=1000), "y": rng.normal(size=1000), "z": rng.normal(size=1000)}

with hm.Plot(data=data, type="3d", height=400) as chart:
    hm.Points(x="x", y="y", z="z", fill="z", size=4)
chart
