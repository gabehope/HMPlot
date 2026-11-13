+++
schema = 1
id = "histogram"
category = "statistical"
data = ["reaction_times"]
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Reaction times", "Reaction time (ms)", "Trials", "median"]
+++

`data/reaction_times.csv` has 10,000 reaction times (trial, reaction_ms). Draw a histogram of reaction_ms with 50 bins, and a vertical line at the median labeled "median". Title the chart "Reaction times", the x axis "Reaction time (ms)" and the y axis "Trials".
