+++
schema = 1
id = "calendar-anomalies"
category = "interaction"
data = ["sensors"]
source = "d3-hard"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900
inspiration = "https://observablehq.com/@d3/calendar"

[[checks]]
kind = "text"
all = ["Temperature anomaly calendar"]

[[checks]]
kind = "views"
min = 1

[[checks]]
kind = "interaction"
action = "brush"
+++

`data/readings.parquet` contains hourly sensor temperatures through leap year 2024 (sensor, time in UTC, temp_c), with missing hours; `data/sensors.csv` maps each sensor to one of six regions. Build a dashboard titled "Temperature anomaly calendar" with one calendar heatmap per region in a two-column, three-row grid. Use Monday-through-Sunday rows, calendar-week columns, readable month labels, and correct placement of February 29 and both partial end weeks. Compute each region's daily mean from available readings; color its anomaly from that region's mean for the same calendar month, with one shared diverging scale centered on zero and one colorbar. Days without data remain visibly missing, never zero. Below the calendars place a full-year overview of daily mean temperature; dragging a date interval highlights the same dates in every calendar and updates a detail chart with the 24-hour mean temperature profile of each region using only readings in the selected interval. Include selected start/end dates and the count of contributing readings; clearing restores the full year. Hovering a calendar day shows its date, mean, anomaly and reading count and highlights that date across the other regions. Keep baseline monthly means fixed while brushing. Interactions must work offline without Python callbacks.
