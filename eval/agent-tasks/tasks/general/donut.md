+++
schema = 1
id = "donut"
category = "basic"
data = ["sales"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Revenue share by product", "Hardware", "Software", "Services", "%"]
+++

`data/sales.csv` has quarterly revenue from 2023-Q1 to 2024-Q4 (quarter, region, product, revenue_k), in thousands of US dollars, for four regions (North, South, East, West) and three products (Hardware, Software, Services). Make a donut chart of each product's share of total 2024 revenue, each slice labeled with its percentage, and a legend or labels naming the products. Title the chart "Revenue share by product".
