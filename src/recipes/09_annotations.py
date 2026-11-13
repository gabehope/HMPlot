"""Annotations: reference lines, shaded spans and labels
Plot rules= and bands= mark values and ranges; a Text with its own data= labels chosen points."""
import numpy as np
import hmplot as hm

t = np.arange(60)
data = {"t": t, "v": 50 + 10 * np.sin(t / 6)}

with hm.Plot(data=data, height=340,
             rules=[{"axis": "y", "value": 55, "label": "target", "dash": [4, 3]}],
             bands=[{"axis": "x", "from": 20, "to": 35, "label": "campaign"}]) as chart:
    hm.Line(x="t", y="v", width=2)
    hm.Text(data={"t": [47], "v": [60], "note": ["peak"]}, x="t", y="v", text="note", dy=-14)
chart
