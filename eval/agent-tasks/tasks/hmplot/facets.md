+++
schema = 1
id = "facets"
category = "layout and annotation"
data = ["stations"]
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Temperature falls with elevation", "North", "South", "East", "West"]

[[checks]]
kind = "views"
min = 4

[[checks]]
kind = "rows"
min = 600
+++

`data/stations.csv` has 600 weather stations in four regions (station, region, elevation_m, mean_temp_c, precip_mm). Make small multiples: one scatter plot of elevation (x) against mean temperature (y) per region, four panels in a row or a grid, the region's name above each panel, and the same axis ranges in every panel. Title the figure "Temperature falls with elevation".
