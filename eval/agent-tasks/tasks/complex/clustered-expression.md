+++
schema = 1
id = "clustered-expression"
category = "statistical"
data = ["expression"]
interaction = "hover"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Gene expression", "Expression by condition"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "hover"
+++

`data/expression.csv` has log2 expression values for genes across samples (gene, sample, condition, log2_expression). Make a clustered heatmap: genes as rows and samples as columns, both ordered by hierarchical clustering (average linkage on correlation distance), with the row dendrogram drawn on the left and the column dendrogram on top, a colored strip above the columns showing each sample's condition with a legend, and a diverging color scale centered on each gene's mean (z-scores per gene) with a color bar. Title it "Gene expression". Beside it, a panel titled "Expression by condition" shows a box plot with the individual points of the hovered gene's expression by condition; hovering a heatmap row changes the gene shown.
