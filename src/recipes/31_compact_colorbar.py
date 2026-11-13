"""Compact colorbar text and horizontal placement
The current colorbar has fixed geometry: this styles its heading and placement, not ramp dimensions."""
import numpy as np
import hmplot as hm

colors = hm.continuous(domain=[-1, 1], colormap="RdBu")
with hm.Theme(value={"extends": ["notebook", "legend/compact", "legend/inline-bottom"]}) as presentation:
    with hm.Plot(height=340, title="Correlation matrix", legend=False,
                 x={"scale": hm.categorical(domain=["Temperature", "Moisture", "Growth"]), "tick_label_angle": 30},
                 y={"scale": hm.categorical(domain=["Temperature", "Moisture", "Growth"])}) as chart:
        cells = hm.Heatmap(fill=np.array([[1, 0.2, -0.4], [0.2, 1, 0.5], [-0.4, 0.5, 1]]),
                           fill_scale=colors, pixelated=True)
        hm.Legend(target=cells, channel="fill", label="Correlation", position="bottom")
chart
