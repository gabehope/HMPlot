+++
schema = 1
id = "scatter-matrix"
category = "layout and annotation"
data = ["cars"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Car attributes", "horsepower", "mpg", "weight_kg", "USA", "Europe", "Japan"]

[[checks]]
kind = "views"
min = 3
+++

`data/cars.csv` has 406 cars (model, origin, year, horsepower, mpg, weight_kg). Make a scatter plot matrix of horsepower, mpg and weight_kg: every pair of the three as a scatter plot, a histogram of each attribute on the diagonal, points colored by origin, and a legend of the origins. Title the figure "Car attributes".
