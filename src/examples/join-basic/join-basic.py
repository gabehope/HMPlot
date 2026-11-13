import hmplot as hm

data = {"station": ["A", "B", "C", "A", "B", "C"], "temperature": [12, 15, 9, 14, 16, 10]}
stations = {"station": ["A", "B", "C"], "altitude": [200, 50, 900]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Join(data=stations, on="station"):
        hm.Points(x="altitude", y="temperature")
plot
