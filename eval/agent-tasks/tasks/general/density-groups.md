+++
schema = 1
id = "density-groups"
category = "statistical"
data = ["penguins"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Flipper length by species", "Flipper length (mm)", "Density", "Adelie", "Chinstrap", "Gentoo"]
+++

`data/penguins.csv` has one row per penguin (species, island, bill_length_mm, bill_depth_mm, flipper_length_mm, body_mass_g, sex); two penguins have missing measurements. Draw one kernel density curve of flipper length per species, each filled with a semi-transparent color, overlapping on the same axes, with a legend of the species. Title the chart "Flipper length by species", the x axis "Flipper length (mm)" and the y axis "Density".
