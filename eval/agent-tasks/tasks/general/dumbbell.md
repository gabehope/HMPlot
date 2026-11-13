+++
schema = 1
id = "dumbbell"
category = "layout and annotation"
data = ["countries_years"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Life expectancy, 1950 and 2020", "Life expectancy (years)", "1950", "2020"]
+++

`data/countries_years.csv` has 120 countries every 5 years from 1950 to 2020 (country, continent, year, gdp_per_capita, life_expectancy, population). Find the 12 countries whose life expectancy rose the most from 1950 to 2020 and make a dumbbell chart: one row per country, sorted by the gain, a point for 1950 and a point for 2020 joined by a line, with a legend or labels telling the two years apart. Title the chart "Life expectancy, 1950 and 2020" and the x axis "Life expectancy (years)".
