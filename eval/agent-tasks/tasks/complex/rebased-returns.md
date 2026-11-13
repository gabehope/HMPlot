+++
schema = 1
id = "rebased-returns"
category = "interaction"
data = ["stocks"]
interaction = "hover"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Growth of 100", "Daily volume"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "hover"
+++

`data/stocks.csv` has daily closing prices and volumes for four stocks (date, ticker, close, volume) on business days in 2023 and 2024. Make a stacked two-panel chart that shares one time axis. The top panel, titled "Growth of 100", shows each ticker's price rebased to 100 at a base date; moving the pointer over the chart sets the base date to the date under the pointer, so all four lines re-normalize live to 100 there, with a vertical rule at the base date across both panels and a label on each line's right end showing its value at the last date. The bottom panel, titled "Daily volume", shows stacked volume bars per day by ticker. The panels' x axes stay aligned and zoom and pan together. Use the same ticker colors in both panels with one legend.
