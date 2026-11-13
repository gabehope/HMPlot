+++
schema = 1
id = "annotated-line"
category = "layout and annotation"
data = ["stocks"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["ALDR closing price", "Close (USD)", "Product recall", "Peak", "2023 average"]
+++

`data/stocks.csv` has daily closing prices and volumes for four stocks (date, ticker, close, volume) on business days from 2023-01-02 to 2024-12-31; the tickers are ALDR, BRNX, CYPT and DOVA. Plot ALDR's daily close as a line. Shade the period from 2024-03-01 to 2024-05-31 and label the shaded span "Product recall". Mark the highest close with a point and a text label "Peak" pointing at it, and draw a horizontal dashed line at the 2023 average close labeled "2023 average". Title the chart "ALDR closing price" and the y axis "Close (USD)".
