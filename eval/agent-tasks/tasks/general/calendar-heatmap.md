+++
schema = 1
id = "calendar-heatmap"
category = "layout and annotation"
data = ["visits"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Daily site visits, 2024", "Jan", "Dec"]
+++

`data/visits.csv` has a website's visits per day in 2024 (date, visits). Make a calendar heatmap: one cell per day, columns by week and rows by weekday (Monday to Sunday), colored by visits with a sequential color scale and a color bar, the months labeled along the top as Jan to Dec. Title the chart "Daily site visits, 2024".
