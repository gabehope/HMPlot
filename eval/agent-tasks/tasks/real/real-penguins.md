+++
schema = 1
id = "real-penguins"
category = "basic"
source = "real"
access = "provided"
tracks = ["python", "javascript"]
data = []
[[sources]]
url = "https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins_raw.csv"
destination = "penguins_raw.csv"
max_bytes = 2000000
sha256 = "144f623143c9360fd77322a4f86acb06dc198814dbd2669724c63e6457b907bd"
license = "CC0; Palmer Penguins"
[[checks]]
kind = "text"
all = ["Palmer penguin bills"]
+++

Use data/penguins_raw.csv from Palmer Penguins. Plot bill length against bill depth, color points by species, and show a species legend. Title it "Palmer penguin bills". Exclude missing bill measurements and label both axes with millimeters.
