+++
schema = 1
id = "bubbles"
category = "basic"
data = ["countries"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Wealth and health", "GDP per capita (USD, log scale)", "Life expectancy (years)", "Africa", "Europe"]
+++

`data/countries.csv` has 160 countries (country, continent, gdp_per_capita, life_expectancy, population). Make a bubble chart of GDP per capita (x, log scale) against life expectancy (y), with each bubble's area proportional to population and its color by continent, and a legend of the continents. Title the chart "Wealth and health", the x axis "GDP per capita (USD, log scale)" and the y axis "Life expectancy (years)".
