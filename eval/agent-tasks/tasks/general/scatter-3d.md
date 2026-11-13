+++
schema = 1
id = "scatter-3d"
category = "maps and 3D"
interaction = "rotate"
data = ["cars"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Cars in three dimensions", "Horsepower", "Weight (kg)", "MPG", "Japan"]

[[checks]]
kind = "interaction"
action = "rotate"
+++

`data/cars.csv` has 406 cars (model, origin, year, horsepower, mpg, weight_kg). Make an interactive 3D scatter plot of horsepower, weight_kg and mpg, points colored by origin, a legend of the origins, and the view rotatable with the mouse. Title the chart "Cars in three dimensions" and label the three axes "Horsepower", "Weight (kg)" and "MPG".
