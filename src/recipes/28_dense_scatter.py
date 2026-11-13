"""Dense scatter with a local point partial
The palette and fill encoding survive; tick density and grid preferences belong to individual axes."""
import numpy as np
import hmplot as hm

i = np.arange(400)
data = {"x": np.sin(i * 1.3), "y": np.cos(i * 1.7), "station": np.array(["North", "South"])[i % 2]}
with hm.Theme(value={"extends": ["notebook", "marks/points-dense", "legend/compact"]}) as presentation:
    with hm.Plot(data=data, height=360, title="Station observations",
                 x={"label": "Horizontal displacement", "tick_count": 4, "grid": "off"},
                 y={"label": "Vertical displacement", "tick_count": 4, "grid": "major"}) as chart:
        hm.Points(x="x", y="y", fill="station")
chart
