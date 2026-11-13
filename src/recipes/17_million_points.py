"""A million points
Points draws every row on the GPU; set max_elements when a mark has more than 250,000 rows."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(12)
n = 1_000_000
data = {"x": rng.normal(size=n).astype(np.float32), "y": rng.normal(size=n).astype(np.float32)}

with hm.Plot(data=data, height=380) as chart:
    hm.Points(x="x", y="y", size=1, opacity=0.2, max_elements=n)
chart
