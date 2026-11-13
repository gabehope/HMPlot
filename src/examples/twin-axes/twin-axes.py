import numpy as np
import hmplot as hm

# A day of weather on two y axes over one hour axis: each Frame has a y scale of its own,
# temperature on the left and rainfall on the right. The minimap below shows the whole day; drag
# its window, or zoom the plot, and both lines move together. Its labels follow the rainfall
# frame's axis.
hour = np.arange(25)
weather = {
    "hour": hour,
    "temperature": 15 + 8 * np.sin(hour / 24 * 2 * np.pi),
    "rain": np.maximum(0, 12 * np.cos(hour / 5)),
}

with hm.Scene() as scene:
    with hm.Plot(data=weather, height=420, legend=True) as plot:
        with hm.Frame(name="Temperature", x={"domain": [0, 24], "label": "Hour"},
                      y={"domain": [5, 25], "label": "Temperature · °C"}):
            hm.Line(x="hour", y="temperature", color="#547ba2", label="Temperature")
        with hm.Frame(name="Rainfall", x={"domain": [0, 24], "visible": False},
                      y={"domain": [0, 15], "label": "Rainfall · mm", "side": "right"}) as rainfall:
            hm.Line(x="hour", y="rain", color="#cf8955", label="Rainfall")
    hm.Minimap(target=plot, axis=rainfall, width=600, height=100, axes={"x": True, "y": False})
scene
