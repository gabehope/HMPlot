+++
schema = 1
id = "flight-network"
category = "interaction"
data = ["flights"]
interaction = "brush"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Flight network", "Departure hour"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "brush"
# The brushable view is the second.
target = "last"
+++

`data/flights.parquet` has 200,000 flights (flight_id, origin, dest, dep_hour, distance_km, delay_min) between the 40 airports in `data/airports.csv` (code, name, lon, lat). Make a two-view dashboard. The first view is a map titled "Flight network": each airport is a point sized by its number of departures, and each origin-destination route is a curved arc whose width shows its number of flights and whose color shows its mean delay on a diverging scale centered on 0 minutes, with a color legend. The second view is a histogram of departure hour titled "Departure hour". Dragging a range on the histogram (a brush) recomputes everything on the map from the flights in that range: route widths, route colors and airport sizes. Hovering an airport highlights its routes and fades the others, and a tooltip shows the airport's name and its number of departures.
