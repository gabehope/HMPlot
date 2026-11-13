+++
schema = 1
id = "regression-band"
category = "statistical"
data = ["cars"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Fuel economy falls with weight", "Weight (kg)", "Miles per gallon"]
+++

`data/cars.csv` has 406 cars (model, origin, year, horsepower, mpg, weight_kg). Make a scatter plot of weight_kg (x) against mpg (y) with a fitted straight regression line and a shaded 95% confidence band around it. Title the chart "Fuel economy falls with weight", the x axis "Weight (kg)" and the y axis "Miles per gallon".
