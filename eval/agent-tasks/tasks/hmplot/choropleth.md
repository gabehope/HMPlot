+++
schema = 1
id = "choropleth"
category = "maps and 3D"
data = ["districts"]
interaction = "hover"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Median rent by district"]

[[checks]]
kind = "interaction"
action = "hover"
+++

`data/districts.geojson` has 99 districts of a city (each feature's property `district` is its name) and `data/district_rents.csv` has each district's median rent (district, median_rent_eur, population). Draw a map of the districts colored by median rent, with a color legend and a tooltip that shows the district and its rent on hover. Title the map "Median rent by district".
