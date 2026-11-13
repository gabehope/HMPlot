+++
schema = 1
id = "correlation-heatmap"
category = "statistical"
data = ["cars"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Correlation between car attributes", "horsepower", "mpg", "weight_kg", "year"]
+++

`data/cars.csv` has 406 cars (model, origin, year, horsepower, mpg, weight_kg). Compute the correlation matrix of year, horsepower, mpg and weight_kg, and draw it as a heatmap with a diverging color scale from -1 to 1 centered on 0, each cell labeled with its value to two decimals, and a color bar. Title the chart "Correlation between car attributes".
