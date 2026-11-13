+++
schema = 1
id = "waterfall"
category = "layout and annotation"
data = ["budget"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["From revenue to net income", "Thousand USD", "Revenue", "Net income", "Salaries"]
+++

`data/budget.csv` has a company's income statement in thousands of US dollars (item, amount_k): revenue first, then costs (negative) and other items. Make a waterfall chart: a bar for each item that starts where the previous one ended, increases in green and decreases in red, each bar labeled with its amount, and a final total bar labeled "Net income" showing the result. Title the chart "From revenue to net income" and the value axis "Thousand USD".
