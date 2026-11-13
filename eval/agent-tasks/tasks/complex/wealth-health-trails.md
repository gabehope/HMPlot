+++
schema = 1
id = "wealth-health-trails"
category = "animation and simulation"
data = ["countries_years"]
interaction = "animate"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Wealth and health, 1950-2020"]

[[checks]]
kind = "input"
any = ["range"]

[[checks]]
kind = "interaction"
action = "animate"
+++

`data/countries_years.csv` has 120 countries every 5 years from 1950 to 2020 (country, continent, year, gdp_per_capita, life_expectancy, population). Make an animated bubble chart of GDP per capita (x, log scale) against life expectancy (y), bubbles sized by population (area proportional to population) and colored by continent, with a continent legend. Animate smoothly between the 5-year snapshots (interpolate positions and sizes between them, not jumps), with a play/pause button and a year slider that scrubs continuously. The five most populous countries of 2020 leave a faded trail of their earlier positions behind them and carry a text label that moves with them. Show the current year as a large faint number in the background of the plot. Keep both axis ranges fixed. Title the chart "Wealth and health, 1950-2020".
