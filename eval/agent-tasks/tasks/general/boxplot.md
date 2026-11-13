+++
schema = 1
id = "boxplot"
category = "statistical"
data = ["scores"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Exam scores by school", "School", "Score", "Ashford", "Fairview"]
+++

`data/scores.csv` has exam scores for 720 students in six schools (school, student, hours_studied, score). Make a box plot of score per school, one box per school, and overlay every student as a small jittered point. Title the chart "Exam scores by school", the x axis "School" and the y axis "Score".
