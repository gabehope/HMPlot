+++
schema = 1
id = "ten-million"
category = "scale"
big_data = true
data = ["pickups_10m"]
timeout = 900
interaction = "slider"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Ten million taxi pickups"]

[[checks]]
kind = "input"
any = ["range", "select"]

[[checks]]
kind = "interaction"
action = "slider"
+++

`data/pickups_10m.parquet` has 10,000,000 taxi pickups (x_km and y_km: the pickup's position in km east and north of the city centre; fare_usd; distance_km; hour). Show the density of pickups over (x_km, y_km), counting every pickup (a heatmap, or points shaded by density), that shows finer detail when zooming in. Add a control for the hour of day (0 to 23, and all hours, starting at all hours) that filters the pickups live. Title the chart "Ten million taxi pickups".
