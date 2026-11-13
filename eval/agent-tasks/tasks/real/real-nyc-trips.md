+++
schema = 1
id = "real-nyc-trips"
category = "scale"
source = "real"
access = "agent_fetch"
tracks = ["python", "javascript"]
data = []
[[sources]]
url = "https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet"
destination = "yellow_tripdata_2024-01.parquet"
max_bytes = 100000000
sha256 = "c4d59da7bbc8abaeeeb1727947ee93d9891a71acb42854bd80db1571b2030510"
license = "NYC TLC open data; check TLC terms"
[[checks]]
kind = "text"
all = ["NYC taxi trips"]
+++

Using the pinned NYC TLC January 2024 yellow taxi trip records, make an interactive scatter or density plot of trip distance versus total amount. Filter invalid or missing values and show a fare or time control. The source parquet is data/yellow_tripdata_2024-01.parquet; title the chart "NYC taxi trips".
