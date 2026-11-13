+++
schema = 1
id = "pdf-figure"
category = "export"
data = ["trial"]
pdf = true
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Day", "Response", "Baseline", "Response at day 28", "Placebo", "Low dose", "High dose"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "pdf"
pages = 1
width_mm = 180
height_mm = 80
text = ["Day", "Response", "Baseline", "Response at day 28", "Placebo", "Low dose", "High dose"]
fonts_embedded = true
max_raster_fraction = 0.05
+++

`data/trial.csv` has a clinical trial's measurements (subject, group, day, baseline, response): 40 subjects in each of three groups ("Placebo", "Low dose", "High dose"), measured every 4 days from day 0 to day 28. Make a two-panel publication figure: on the left, the mean response per group over days, one line per group with a shaded band of ±1 standard deviation; on the right, a scatter plot of each subject's response at day 28 (y) against their baseline (x), colored by group. One legend for the groups, the panel labels "a" and "b", and the axis titles "Day", "Response", "Baseline" and "Response at day 28". Save it as `output/figure.pdf`, 180 mm wide and 80 mm tall, with its text as selectable text and its marks as vector graphics, and also as the page `output/chart.html`.
