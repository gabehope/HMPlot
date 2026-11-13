import numpy as np
import hmplot as hm

# 2,000 points on a noisy spiral; Shift-drag to brush them.
i = np.arange(2000)
t = i / 100
data = {
    "x": t * np.cos(t) + np.sin(i * 12.9898) * 0.6,
    "y": t * np.sin(t) + np.cos(i * 78.233) * 0.6,
    "t": t,
}

with hm.Plot(data=data, axes2d=True, height=380) as plot:
    hm.Points(x="x", y="y", fill="t", size=2, brush=True)
