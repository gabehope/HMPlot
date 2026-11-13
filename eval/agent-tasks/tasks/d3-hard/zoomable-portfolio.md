+++
schema = 1
id = "zoomable-portfolio"
category = "interaction"
data = ["portfolio"]
source = "d3-hard"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900
inspiration = "https://observablehq.com/@d3/zoomable-treemap"

[[checks]]
kind = "text"
all = ["Portfolio explorer"]

[[checks]]
kind = "views"
min = 1

[[checks]]
kind = "interaction"
action = "click"
+++

`data/portfolio.csv` has 360 products in a division / department / product hierarchy, with revenue_k, orders and margin_pct. Build a zoomable treemap dashboard titled "Portfolio explorer". Start at six divisions; rectangle area represents summed revenue_k and color identifies the division. Clicking a division fills the same view with its departments; clicking a department shows its products. Provide an always-visible breadcrumb and an Up control to return through the hierarchy. Labels should show names and totals where there is room, with tooltips for smaller rectangles. A metric control switches area between revenue and orders and updates the current view without losing the current hierarchy location; color identity stays stable. Beside the treemap show the top ten products within the current subtree, and the subtree total with correct units. Parent values must equal the sum of their products; every visible rectangle has a positive area, siblings do not overlap, and changing metric or going back must not accumulate duplicate labels. All drilldown and controls work in the standalone page without Python callbacks.
