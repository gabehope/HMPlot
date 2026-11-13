+++
schema = 1
id = "matplotbench-89"
category = "basic"
source = "matplotbench"
access = "provided"
tracks = ["python"]
data = []
upstream_id = 89
[[sources]]
url = "https://codeload.github.com/thunlp/MatPlotAgent/zip/refs/heads/main"
destination = "matplotagent.zip"
max_bytes = 250000000
sha256 = "6e4b0245e044cf8d250e5f3b27a0df8e468bec0990ee38ea7cc1759bc9b7b780"
license = "MatPlotBench redistribution terms unverified"
archive_member = "benchmark_data/data/89/data.csv"
extract_as = "data.csv"
upstream_id = 89
[[sources]]
url = "https://raw.githubusercontent.com/thunlp/MatPlotAgent/main/benchmark_data/benchmark_instructions.json"
destination = "benchmark_instructions.json"
max_bytes = 2000000
sha256 = "a41d4a77f604f1293702e4664f4d485c03fefb64f26c7c77b4ce057643c24480"
license = "MatPlotBench redistribution terms unverified"
role = "prompt"
upstream_id = 89
[[checks]]
kind = "text"
all = ["Browser Market Share"]
+++

Using data/data.csv, make a two-ring browser market-share sunburst with browsers inside and versions outside. Label browsers on their segments and versions with leader lines, with visible white gaps and a hollow center. Title it "Browser Market Share".
