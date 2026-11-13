+++
schema = 1
id = "bars-sorted"
category = "basic"
data = ["sales"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Revenue by region, 2024", "Revenue (thousand USD)", "North", "South", "East", "West"]
+++

`data/sales.csv` has quarterly revenue from 2023-Q1 to 2024-Q4 (quarter, region, product, revenue_k), in thousands of US dollars, for four regions (North, South, East, West) and three products (Hardware, Software, Services). Make a horizontal bar chart of each region's total revenue in 2024, sorted from largest at the top to smallest, with each bar labeled with its value. Title the chart "Revenue by region, 2024" and the value axis "Revenue (thousand USD)".
