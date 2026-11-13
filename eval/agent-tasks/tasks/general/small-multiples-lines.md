+++
schema = 1
id = "small-multiples-lines"
category = "layout and annotation"
data = ["stocks"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Daily closing prices", "ALDR", "BRNX", "CYPT", "DOVA"]

[[checks]]
kind = "views"
min = 4
+++

`data/stocks.csv` has daily closing prices and volumes for four stocks (date, ticker, close, volume) on business days from 2023-01-02 to 2024-12-31; the tickers are ALDR, BRNX, CYPT and DOVA. Make small multiples: one line chart of the daily close per ticker, four panels in a 2 by 2 grid, the ticker as each panel's title, a shared x axis range and each panel with its own y axis range. Title the figure "Daily closing prices".
