+++
schema = 1
id = "pdf-grouped-bars"
category = "export"
pdf = true
data = ["sales"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Revenue (thousand USD)", "Hardware", "Software", "Services"]

[[checks]]
kind = "pdf"
pages = 1
width_mm = 160
height_mm = 100
text = ["Revenue (thousand USD)", "Hardware", "Software", "Services", "North"]
fonts_embedded = true
max_raster_fraction = 0.05
+++

`data/sales.csv` has quarterly revenue from 2023-Q1 to 2024-Q4 (quarter, region, product, revenue_k), in thousands of US dollars, for four regions (North, South, East, West) and three products (Hardware, Software, Services). Make a publication figure: a grouped bar chart of total 2024 revenue, one group per region and one bar per product, with a legend of the products, the value axis titled "Revenue (thousand USD)" and no chart title. Save it as `output/figure.pdf`, 160 mm wide and 100 mm tall, with its text as selectable text, its fonts embedded and its bars as vector graphics, and also as the page `output/chart.html`.
