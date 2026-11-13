+++
schema = 1
id = "map-tiles"
category = "maps and 3D"
data = ["cafes"]
interaction = "hover"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Cafés in Lisbon"]

[[checks]]
kind = "interaction"
action = "hover"
+++

`data/cafes.csv` has 300 cafés in Lisbon (name, lon, lat, rating). Show them as points over a street map whose tiles load from a tile service (OpenStreetMap or another), colored by rating, centered on Lisbon at street level; dragging and zooming the map loads new tiles. Hovering a café shows its name and rating. Title the map "Cafés in Lisbon".
