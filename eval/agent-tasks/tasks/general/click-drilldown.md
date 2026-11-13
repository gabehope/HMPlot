+++
schema = 1
id = "click-drilldown"
category = "interaction"
interaction = "click"
data = ["sales"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Revenue by region", "Revenue by product", "Hardware", "North"]

[[checks]]
kind = "views"
min = 2
[[checks]]
kind = "interaction"
action = "click"
+++

`data/sales.csv` has quarterly revenue from 2023-Q1 to 2024-Q4 (quarter, region, product, revenue_k), in thousands of US dollars, for four regions (North, South, East, West) and three products (Hardware, Software, Services). Show two views side by side: a bar chart of total 2024 revenue per region, and a bar chart of total 2024 revenue per product. Clicking a region's bar filters the product chart to that region (clicking it again, or clicking the background, shows all regions). Title the first chart "Revenue by region" and the second "Revenue by product".
