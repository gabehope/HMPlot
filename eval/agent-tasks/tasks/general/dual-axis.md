+++
schema = 1
id = "dual-axis"
category = "layout and annotation"
data = ["weather_monthly"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Lisbon climate, 2024", "Precipitation (mm)", "Temperature (°C)"]
+++

`data/weather_monthly.csv` has monthly climate for 2024 in three cities (month, city, mean_temp_c, precip_mm). For Lisbon only, draw monthly precipitation as bars against a left y axis and mean temperature as a line with points against a right y axis, with the months on the x axis. Title the chart "Lisbon climate, 2024", the left axis "Precipitation (mm)" and the right axis "Temperature (°C)".
