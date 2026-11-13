"""Two y axes over one x axis
Each Frame has a y scale of its own; side="right" puts the second axis on the right."""
import numpy as np
import hmplot as hm

hour = np.arange(25)
data = {"hour": hour, "temperature": 15 + 8 * np.sin(hour / 24 * 2 * np.pi), "rain": np.maximum(0, 12 * np.cos(hour / 5))}

with hm.Plot(data=data, height=340) as chart:
    with hm.Frame(x={"domain": [0, 24], "label": "Hour"}, y={"domain": "auto", "label": "Temperature (°C)"}):
        hm.Line(x="hour", y="temperature", color="#547ba2")
    with hm.Frame(x={"domain": [0, 24], "visible": False}, y={"domain": "auto", "label": "Rain (mm)", "side": "right"}):
        hm.Line(x="hour", y="rain", color="#cf8955")
chart
