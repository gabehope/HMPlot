+++
schema = 1
id = "crossfilter"
category = "interaction"
fixed = true
data = ["flights"]
interaction = "brush"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Departure hour", "Distance (km)", "Delay (min)"]

[[checks]]
kind = "views"
min = 3

[[checks]]
kind = "interaction"
action = "brush"
+++

`data/flights.parquet` has 200,000 flights (flight_id, origin, dest, dep_hour, distance_km, delay_min). Show three histograms: departure hour, distance and delay. Each histogram has a brush (drag to select a range along its x axis). Each histogram shows the flights inside the other two histograms' brushed ranges, and is not filtered by its own brush, so its brush can be moved over all of its bars. Title the histograms "Departure hour", "Distance (km)" and "Delay (min)".
