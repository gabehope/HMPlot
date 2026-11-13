+++
schema = 1
id = "error-bars"
category = "statistical"
data = ["trial"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Response over time by dose", "Day", "Mean response", "Placebo", "Low dose", "High dose"]
+++

`data/trial.csv` has a clinical trial's measurements (subject, group, day, baseline, response): 40 subjects in each of three groups ("Placebo", "Low dose", "High dose"), measured every 4 days from day 0 to day 28. Plot the mean response per group on each day as points connected by lines, with error bars showing the 95% confidence interval of the mean, one color per group and a legend. Offset the groups slightly along x so their error bars do not overlap. Title the chart "Response over time by dose", the x axis "Day" and the y axis "Mean response".
