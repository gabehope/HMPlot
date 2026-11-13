+++
schema = 1
id = "marginals"
category = "layout and annotation"
data = ["penguins"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Bills with marginal distributions", "Bill length (mm)", "Bill depth (mm)"]

[[checks]]
kind = "views"
min = 3
+++

`data/penguins.csv` has one row per penguin (species, island, bill_length_mm, bill_depth_mm, flipper_length_mm, body_mass_g, sex); two penguins have missing measurements. Make a scatter plot of bill length (x) against bill depth (y) colored by species, with a histogram of bill length above it and a histogram of bill depth to its right, aligned with the scatter plot's axes. Title the figure "Bills with marginal distributions", the x axis "Bill length (mm)" and the y axis "Bill depth (mm)".
