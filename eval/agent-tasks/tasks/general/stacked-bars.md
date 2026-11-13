+++
schema = 1
id = "stacked-bars"
category = "basic"
data = ["sales"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Quarterly revenue by product", "Quarter", "Revenue (thousand USD)", "Hardware", "Software", "Services"]
+++

`data/sales.csv` has quarterly revenue from 2023-Q1 to 2024-Q4 (quarter, region, product, revenue_k), in thousands of US dollars, for four regions (North, South, East, West) and three products (Hardware, Software, Services). Make a stacked bar chart with one bar per quarter (all regions summed), each bar stacked by product, with a legend of the products. Title the chart "Quarterly revenue by product", the x axis "Quarter" and the y axis "Revenue (thousand USD)".
