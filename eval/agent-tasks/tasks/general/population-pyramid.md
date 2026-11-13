+++
schema = 1
id = "population-pyramid"
category = "layout and annotation"
data = ["population"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Population by age and sex", "Male", "Female", "85+"]
+++

`data/population.csv` has a population by five-year age group and sex (age_group, sex, population), from "0-4" to "85+". Make a population pyramid: one horizontal bar per age group, males extending to the left and females to the right of a shared center line, the youngest group at the bottom, the population axis labeled with positive values on both sides. Title the chart "Population by age and sex" and label the two sides "Male" and "Female".
