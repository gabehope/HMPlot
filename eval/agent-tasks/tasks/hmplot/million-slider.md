+++
schema = 1
id = "million-slider"
category = "scale"
big_data = true
control_label = "Maximum fare (USD)"
data = ["pickups"]
timeout = 600
interaction = "slider"
source = "hmplot"
access = "provided"
tracks = ["python", "javascript"]

[[checks]]
kind = "text"
all = ["One million taxi pickups", "Maximum fare (USD)"]

[[checks]]
kind = "rows"
min = 1000000

[[checks]]
kind = "input"
any = ["range"]

[[checks]]
kind = "interaction"
action = "slider"
+++

`data/pickups.parquet` has 1,000,000 taxi pickups (x_km and y_km: the pickup's position in km east and north of the city centre; fare_usd; distance_km; hour). Draw every pickup as a point at (x_km, y_km), colored by fare, with equal scales on both axes. Add a slider labeled "Maximum fare (USD)" from 0 to 100, starting at 100: only pickups with a fare at or below its value are shown, and the plot updates live while the slider moves. Panning and zooming the plot works. Title the chart "One million taxi pickups".
