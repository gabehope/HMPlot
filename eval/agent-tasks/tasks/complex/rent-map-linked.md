+++
schema = 1
id = "rent-map-linked"
category = "maps and 3D"
data = ["districts"]
interaction = "hover"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Median rent by district", "Rent against population"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "hover"
+++

`data/districts.geojson` has the 99 districts of a city (property `district`) and `data/district_rents.csv` has each district's median_rent_eur and population. Make a linked pair: a choropleth map of median rent titled "Median rent by district", zoomed to the city, using five quantile classes of a sequential color scale with a legend that shows each class's range, and a scatter plot titled "Rent against population" of median rent against population with a fitted regression line. Hovering a district on the map outlines it and highlights its point in the scatter plot; hovering a point outlines its district on the map. A tooltip on either view shows the district name, rent and population. Label the three most expensive districts on the map.
