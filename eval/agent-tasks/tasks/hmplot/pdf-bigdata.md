+++
schema = 1
id = "pdf-bigdata"
category = "export"
big_data = true
data = ["pickups"]
pdf = true
timeout = 600
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["One million taxi pickups", "km east", "km north"]

[[checks]]
kind = "pdf"
pages = 1
width_mm = 160
text = ["One million taxi pickups", "km east", "km north"]
fonts_embedded = true
+++

`data/pickups.parquet` has 1,000,000 taxi pickups (x_km and y_km: the pickup's position in km east and north of the city centre; fare_usd; distance_km; hour). Draw every pickup as a point at (x_km, y_km), colored by fare with a color legend, with equal scales on both axes, the title "One million taxi pickups" and the axis titles "km east" and "km north". Save it as `output/figure.pdf`, 160 mm wide (any height), with selectable text (the points may be an image, the axes and text should be vector), and also as the page `output/chart.html`.
