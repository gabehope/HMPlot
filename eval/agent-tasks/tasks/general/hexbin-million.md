+++
schema = 1
id = "hexbin-million"
category = "scale"
big_data = true
timeout = 360
data = ["pickups"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Where taxis pick up", "Pickups"]
+++

`data/pickups.parquet` has 1,000,000 taxi pickups (x_km and y_km: the pickup's position in km east and north of the city centre; fare_usd; distance_km; hour). Make a hexagonal binning density chart of the pickups by x_km (x) and y_km (y) with equal scales on both axes, the hexagons colored on a logarithmic count scale and a color bar labeled "Pickups". Title the chart "Where taxis pick up".
