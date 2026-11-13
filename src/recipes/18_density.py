"""2-D density as contours
DensityContour estimates the density of x and y and draws its contour lines over the points."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(13)
data = {"x": np.concatenate([rng.normal(-1, 0.6, 500), rng.normal(1.5, 0.8, 500)]),
        "y": np.concatenate([rng.normal(0, 0.6, 500), rng.normal(1, 0.5, 500)])}

with hm.Plot(data=data, height=360) as chart:
    hm.Points(x="x", y="y", size=2, fill="#b0b8c0")
    hm.charts.DensityContour(x="x", y="y")
chart
