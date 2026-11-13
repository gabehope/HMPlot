+++
schema = 1
id = "diverging-likert"
category = "layout and annotation"
data = ["survey"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Employee survey results", "Strongly disagree", "Strongly agree", "Neutral", "I get useful feedback"]
+++

`data/survey.csv` has the responses of 480 employees to five statements (question, response, count) on a five-point scale: Strongly disagree, Disagree, Neutral, Agree, Strongly agree. Make a diverging stacked bar chart: one horizontal bar per statement, the disagree responses extending left of a center line and the agree responses to the right, Neutral split evenly across the center, colored from red (disagree) through gray to blue (agree), with percentages on the axis and a legend of the five responses in order. Title the chart "Employee survey results".
