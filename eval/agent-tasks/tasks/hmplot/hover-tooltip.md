+++
schema = 1
id = "hover-tooltip"
category = "interaction"
fixed = true
data = ["countries"]
interaction = "hover"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Wealth and health", "Africa", "Europe"]

[[checks]]
kind = "rows"
min = 160

[[checks]]
kind = "interaction"
action = "hover"
+++

`data/countries.csv` has 160 countries (country, continent, gdp_per_capita, life_expectancy, population). Make a scatter plot of GDP per capita (x, log scale) against life expectancy (y), one point per country, sized by population and colored by continent. Hovering a point highlights it (the other points fade, or it gets an outline) and shows a tooltip with the country's name, GDP per capita and life expectancy. Title the chart "Wealth and health".
