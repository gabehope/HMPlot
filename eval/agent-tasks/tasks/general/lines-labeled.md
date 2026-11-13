+++
schema = 1
id = "lines-labeled"
category = "basic"
data = ["stocks"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Growth of 100 invested", "Value (USD)", "ALDR", "BRNX", "CYPT", "DOVA"]
+++

`data/stocks.csv` has daily closing prices and volumes for four stocks (date, ticker, close, volume) on business days from 2023-01-02 to 2024-12-31; the tickers are ALDR, BRNX, CYPT and DOVA. Make a line chart of the growth of 100 dollars invested in each stock on the first day (each series divided by its first close and multiplied by 100), one line per ticker. Instead of a legend, label each line with its ticker at its right end. Title the chart "Growth of 100 invested" and the y axis "Value (USD)".
