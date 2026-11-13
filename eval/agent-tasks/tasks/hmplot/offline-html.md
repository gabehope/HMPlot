+++
schema = 1
id = "offline-html"
category = "export"
data = ["penguins"]
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Penguins offline", "Biscoe", "Dream", "Torgersen"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "offline"
+++

`data/penguins.csv` has one row per penguin (species, island, bill_length_mm, bill_depth_mm, flipper_length_mm, body_mass_g, sex). Make a page with two charts: a scatter plot of flipper length (x) against body mass (y) colored by species, and a bar chart of the number of penguins per island. The page must work with no internet connection: everything it needs (scripts, styles, data) is inside the HTML file. Title the page "Penguins offline".
