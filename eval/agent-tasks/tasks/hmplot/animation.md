+++
schema = 1
id = "animation"
category = "animation and simulation"
data = ["countries_years"]
interaction = "animate"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Seventy years of wealth and health"]

[[checks]]
kind = "interaction"
action = "animate"
+++

`data/countries_years.csv` has 120 countries every 5 years from 1950 to 2020 (country, continent, year, gdp_per_capita, life_expectancy, population). Make an animated scatter plot of GDP per capita (x, log scale) against life expectancy (y), points sized by population and colored by continent, one frame per year with smooth transitions, a play button and a year slider. Keep the axis ranges fixed across years. Title the chart "Seventy years of wealth and health".
