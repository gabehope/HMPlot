+++
schema = 1
id = "linked-brush"
category = "interaction"
fixed = true
data = ["cars"]
interaction = "brush"
source = "hmplot"
access = "provided"
tracks = ["python", "javascript"]

[[checks]]
kind = "text"
all = ["Horsepower and mpg", "Weight of the selected cars"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "brush"
+++

`data/cars.csv` has 406 cars (model, origin, year, horsepower, mpg, weight_kg). Show two views side by side: a scatter plot of horsepower (x) against mpg (y), and a histogram of weight_kg. Dragging a rectangle (a brush) on the scatter plot selects the cars inside it, and the histogram then shows the weights of the selected cars (alone, or highlighted against all cars). With no brush, the histogram shows all cars. Title the scatter plot "Horsepower and mpg" and the histogram "Weight of the selected cars".
