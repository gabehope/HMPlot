+++
schema = 1
id = "grouped-bars"
category = "basic"
data = ["sales"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Revenue by region and product", "Revenue (thousand USD)", "Hardware", "Software", "Services"]
+++

`data/sales.csv` has quarterly revenue from 2023-Q1 to 2024-Q4 (quarter, region, product, revenue_k), in thousands of US dollars, for four regions (North, South, East, West) and three products (Hardware, Software, Services). Make a grouped bar chart of total 2024 revenue: one group per region, one bar per product within each group, colored by product, with a legend of the products. Title the chart "Revenue by region and product" and the value axis "Revenue (thousand USD)".
