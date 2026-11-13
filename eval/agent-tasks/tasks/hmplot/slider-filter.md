+++
schema = 1
id = "slider-filter"
category = "interaction"
control_label = "Minimum magnitude"
data = ["earthquakes"]
interaction = "slider"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Earthquakes of 2024", "Minimum magnitude"]

[[checks]]
kind = "input"
any = ["range"]

[[checks]]
kind = "interaction"
action = "slider"
+++

`data/earthquakes.csv` has 20,000 earthquakes from 2024 (time, lon, lat, depth_km, magnitude). Plot them by longitude (x) and latitude (y), colored by depth. Add a slider labeled "Minimum magnitude" from 2.5 to 7.0 in steps of 0.1, starting at 4.0: only earthquakes at or above its value are shown, and the plot updates while the slider moves. Title the chart "Earthquakes of 2024".
