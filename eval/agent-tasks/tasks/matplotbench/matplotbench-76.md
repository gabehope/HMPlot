+++
schema = 1
id = "matplotbench-76"
category = "layout and annotation"
source = "matplotbench"
access = "provided"
tracks = ["python"]
data = []
upstream_id = 76
[[sources]]
url = "https://codeload.github.com/thunlp/MatPlotAgent/zip/refs/heads/main"
destination = "matplotagent.zip"
max_bytes = 250000000
sha256 = "6e4b0245e044cf8d250e5f3b27a0df8e468bec0990ee38ea7cc1759bc9b7b780"
license = "MatPlotBench redistribution terms unverified"
archive_member = "benchmark_data/data/76/data.csv"
extract_as = "data.csv"
upstream_id = 76
[[sources]]
url = "https://raw.githubusercontent.com/thunlp/MatPlotAgent/main/benchmark_data/benchmark_instructions.json"
destination = "benchmark_instructions.json"
max_bytes = 2000000
sha256 = "a41d4a77f604f1293702e4664f4d485c03fefb64f26c7c77b4ce057643c24480"
license = "MatPlotBench redistribution terms unverified"
role = "prompt"
upstream_id = 76
[[checks]]
kind = "text"
all = ["Women’s clothing retail sales"]
+++

Using data/data.csv, show a compact box plot above a histogram of women’s clothing retail sales. Label the five-number summary and draw continuous dashed guides at the first and third quartiles across both sections. Title it "Women’s clothing retail sales".
