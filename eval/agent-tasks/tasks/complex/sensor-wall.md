+++
schema = 1
id = "sensor-wall"
category = "layout and annotation"
data = ["sensors"]
interaction = "brush"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Sensor temperatures 2024"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "brush"
# The brushable view is the second.
target = "last"
+++

`data/readings.parquet` has hourly temperature readings from 36 sensors through 2024 (sensor, time in UTC, temp_c; 312,118 rows, with gaps where a sensor was offline) and `data/sensors.csv` has each sensor's region, lat and lon. Make a small-multiples wall titled "Sensor temperatures 2024": one small line chart per sensor in a 6 by 6 grid, grouped by region (one row per region, labeled), all sharing the same y axis, drawn with gaps where data is missing, and readings more than 4 standard deviations from that sensor's 7-day rolling mean marked as red points. Below the grid, an overview chart of the daily mean temperature of all sensors with a brush: dragging a range on it sets the x range of every small chart. Hovering a small chart shows its sensor's name and region.
