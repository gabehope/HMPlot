+++
schema = 1
id = "matplotbench-99"
category = "statistical"
source = "matplotbench"
access = "provided"
tracks = ["python"]
data = []
upstream_id = 99
[[sources]]
url = "https://codeload.github.com/thunlp/MatPlotAgent/zip/refs/heads/main"
destination = "matplotagent.zip"
max_bytes = 250000000
sha256 = "6e4b0245e044cf8d250e5f3b27a0df8e468bec0990ee38ea7cc1759bc9b7b780"
license = "MatPlotBench redistribution terms unverified"
archive_member = "benchmark_data/data/99/data.csv"
extract_as = "data.csv"
upstream_id = 99
[[sources]]
url = "https://raw.githubusercontent.com/thunlp/MatPlotAgent/main/benchmark_data/benchmark_instructions.json"
destination = "benchmark_instructions.json"
max_bytes = 2000000
sha256 = "a41d4a77f604f1293702e4664f4d485c03fefb64f26c7c77b4ce057643c24480"
license = "MatPlotBench redistribution terms unverified"
role = "prompt"
upstream_id = 99
[[checks]]
kind = "text"
all = ["Restaurant bills by day"]
+++

Using data/data.csv, make a dark-themed split violin plot of total bill by day, with smoker halves green and nonsmoker halves grey. Show quartiles inside each violin and title it "Restaurant bills by day".
