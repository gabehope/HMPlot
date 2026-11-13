+++
schema = 1
id = "clustered-heatmap"
category = "layout and annotation"
data = ["expression"]
source = "general"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Gene expression after treatment", "Control", "Treated"]
+++

`data/expression.csv` has the log2 expression of 40 genes in 12 samples (gene, sample, condition, log2_expression): six Control samples (C1 to C6) and six Treated samples (T1 to T6). Make a heatmap with genes as rows and samples as columns, the values centered per gene (each gene minus its mean), a diverging color scale and color bar, the genes ordered by hierarchical clustering, and a colored strip above the columns marking Control and Treated with a legend. Title the chart "Gene expression after treatment".
