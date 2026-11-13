+++
schema = 1
id = "dropdown-lines"
category = "interaction"
interaction = "select"
control_label = "Continent"
data = ["countries_years"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Life expectancy by continent", "Year", "Life expectancy (years)", "Continent"]

[[checks]]
kind = "input"
any = ["select-one"]

[[checks]]
kind = "interaction"
action = "select"
+++

`data/countries_years.csv` has 120 countries every 5 years from 1950 to 2020 (country, continent, year, gdp_per_capita, life_expectancy, population). Make a line chart of life expectancy over the years, one line per country, with a dropdown labeled "Continent" that chooses which continent's countries are shown (Africa, Americas, Asia, Europe or Oceania; Europe first). Title the chart "Life expectancy by continent", the x axis "Year" and the y axis "Life expectancy (years)".
