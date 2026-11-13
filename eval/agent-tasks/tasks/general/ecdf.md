+++
schema = 1
id = "ecdf"
category = "statistical"
data = ["penguins"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Body mass distribution", "Body mass (g)", "Cumulative proportion", "Adelie", "Gentoo"]
+++

`data/penguins.csv` has one row per penguin (species, island, bill_length_mm, bill_depth_mm, flipper_length_mm, body_mass_g, sex); two penguins have missing measurements. Draw the empirical cumulative distribution function of body mass for each species, as step lines, with a legend of the species. Title the chart "Body mass distribution", the x axis "Body mass (g)" and the y axis "Cumulative proportion".
