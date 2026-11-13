+++
schema = 1
id = "overview-detail"
category = "interaction"
interaction = "brush"
data = ["stocks"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["BRNX closing price", "Drag to zoom"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "brush"
# The overview, which is below the detail.
target = "last"
+++

`data/stocks.csv` has daily closing prices and volumes for four stocks (date, ticker, close, volume) on business days from 2023-01-02 to 2024-12-31; the tickers are ALDR, BRNX, CYPT and DOVA. Make an overview-plus-detail chart for BRNX: a small overview line chart of the whole period below a larger detail line chart. Dragging a range (a brush) on the overview sets the detail chart's x range to that period; with no brush the detail shows everything. Title the detail chart "BRNX closing price" and the overview "Drag to zoom".
