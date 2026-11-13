+++
schema = 1
id = "taxi-explorer"
category = "scale"
data = ["pickups"]
interaction = "brush"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Pickup density", "Fare against distance"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "brush"
# The brushable view is the second.
target = "last"
+++

`data/pickups.parquet` has 1,000,000 taxi pickups (x_km, y_km: position in km east and north of the city centre; fare_usd; distance_km; hour). Make a linked two-view explorer over all one million rows. The left view, titled "Pickup density", shows the pickups as hexagonal bins colored by count on a log color scale with a color bar; when you zoom in, the hexagons get smaller so the bins stay a similar size on screen. The right view, titled "Fare against distance", is a scatter plot of fare against distance for every pickup (draw all of them, with transparency). Dragging a rectangle on the scatter plot filters the density map to the pickups inside it, and a slider for the hour of day (0 to 23, plus all hours) filters both views. Show the number of selected pickups as text that updates.
