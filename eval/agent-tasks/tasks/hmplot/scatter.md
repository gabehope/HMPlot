+++
schema = 1
id = "scatter"
category = "basic"
data = ["penguins"]
source = "hmplot"
access = "provided"
tracks = ["python", "javascript"]

[[checks]]
kind = "text"
all = ["Penguin bills", "Bill length (mm)", "Bill depth (mm)", "Adelie", "Chinstrap", "Gentoo"]

[[checks]]
kind = "rows"
min = 340
+++

`data/penguins.csv` has one row per penguin (species, island, bill_length_mm, bill_depth_mm, flipper_length_mm, body_mass_g, sex). Make a scatter plot of bill length (x) against bill depth (y), one point per penguin, colored by species, with a legend of the species. Title the chart "Penguin bills" and the axes "Bill length (mm)" and "Bill depth (mm)".
