+++
schema = 1
id = "real-earthquakes"
category = "maps and 3D"
source = "real"
access = "agent_fetch"
tracks = ["python", "javascript"]
data = []
[[sources]]
url = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2024-01-01&endtime=2024-02-01&minmagnitude=4"
destination = "usgs_2024_01.csv"
max_bytes = 10000000
sha256 = "e5c10418dde22bd5efd2a13dba18ce90405e92c7b7895dda2430c32953704d72"
license = "USGS public domain"
[[sources]]
url = "https://naturalearth.s3.amazonaws.com/110m_cultural/ne_110m_admin_0_countries.zip"
destination = "ne_110m_admin_0_countries.zip"
max_bytes = 5000000
sha256 = "0f243aeac8ac6cf26f0417285b0bd33ac47f1b5bdb719fd3e0df37d03ea37110"
license = "Natural Earth public domain"
[[checks]]
kind = "text"
all = ["USGS earthquakes, January 2024"]
+++

Map USGS earthquakes from the fixed January 2024 query, using Natural Earth country outlines from the accompanying archive. Size events by magnitude and color them by depth. Title the map "USGS earthquakes, January 2024". Fetch both named sources first.
