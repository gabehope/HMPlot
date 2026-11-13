+++
schema = 1
id = "lines"
category = "basic"
data = ["city_temperatures"]
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Daily mean temperature", "Temperature (°C)", "Lisbon", "Oslo", "Singapore"]

[[checks]]
kind = "rows"
min = 2190
+++

`data/city_temperatures.csv` has the daily mean temperature of three cities over 2023 and 2024 (date, city, temperature_c). Draw one line per city over time, on a date axis, each city in its own color with a legend, and a horizontal reference line at 0 °C. Title the chart "Daily mean temperature" and the y axis "Temperature (°C)".
