+++
schema = 1
id = "violin"
category = "statistical"
data = ["scores"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Score distributions", "Score", "Brookside", "Dunmore"]
+++

`data/scores.csv` has exam scores for 720 students in six schools (school, student, hours_studied, score). Make a violin plot of score per school, one violin per school, with a marker at each school's median. Title the chart "Score distributions" and the y axis "Score".
