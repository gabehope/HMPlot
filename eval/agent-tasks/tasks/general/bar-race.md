+++
schema = 1
id = "bar-race"
category = "animation and simulation"
interaction = "animate"
data = ["countries_years"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Richest countries, 1950 to 2020", "1950"]

[[checks]]
kind = "interaction"
action = "animate"
+++

`data/countries_years.csv` has 120 countries every 5 years from 1950 to 2020 (country, continent, year, gdp_per_capita, life_expectancy, population). Make an animated bar chart race of the ten countries with the highest GDP per capita: one frame per year, horizontal bars sorted with the highest at the top, colored by continent, the year shown large on the chart, bars moving smoothly between frames, a play button and a year slider. Title the chart "Richest countries, 1950 to 2020".
