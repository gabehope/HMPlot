+++
schema = 1
id = "percent-bars"
category = "basic"
data = ["sales"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Product mix by region", "Share of revenue (%)", "Hardware", "Software", "Services"]
+++

`data/sales.csv` has quarterly revenue from 2023-Q1 to 2024-Q4 (quarter, region, product, revenue_k), in thousands of US dollars, for four regions (North, South, East, West) and three products (Hardware, Software, Services). Make a 100% stacked bar chart of the 2024 product mix: one bar per region, each bar showing the share of that region's revenue from each product, so every bar spans 0 to 100%. Title the chart "Product mix by region" and the share axis "Share of revenue (%)".
