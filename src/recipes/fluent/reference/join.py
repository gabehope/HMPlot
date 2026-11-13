import hmplot as hm

readings = hm.Data({"station": ["A", "B", "C", "A", "B", "C"], "temperature": [12, 15, 9, 14, 16, 10]})
stations = {"station": ["A", "B", "C"], "altitude": [200, 50, 900]}
with hm.Scene() as chart:
    with hm.Plot(height=300, axes2d=True):
        hm.Points(data=readings.join(stations, on="station"), x="altitude", y="temperature")
chart
