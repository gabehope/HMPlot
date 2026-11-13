+++
schema = 1
id = "flights-airports"
category = "interaction"
fixed = true
data = ["flights"]
interaction = "brush"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Airports", "Departure delays (min)"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "brush"
+++

`data/airports.csv` has 40 airports (code, name, lon, lat) and `data/flights.parquet` has 200,000 flights between them (flight_id, origin, dest, dep_hour, distance_km, delay_min; origin and dest are airport codes). Show a map, or a longitude-latitude scatter plot, of the airports, and a histogram of the flights' departure delays. Brushing airports on the map shows the delays of the flights departing from them in the histogram; brushing a range of delays in the histogram highlights the airports with flights departing in that range; hovering an airport shows its name and its number of departing flights. Title the views "Airports" and "Departure delays (min)".
