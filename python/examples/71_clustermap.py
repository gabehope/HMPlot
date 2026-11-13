"""A clustered heatmap (seaborn's clustermap): scipy clusters the rows and the columns, and
Tree mode="cluster" draws each linkage to scale beside the heatmap. Requires scipy."""
import numpy as np
from scipy.cluster.hierarchy import leaves_list, linkage

from contextlib import contextmanager
import hmplot as hm

# Twelve samples by eight genes, from three sample groups and two gene groups.
samples = [f"S{i + 1}" for i in range(12)]
genes = [f"G{j + 1}" for j in range(8)]
sample_group = np.array([0, 2, 1, 0, 1, 2, 2, 0, 1, 0, 2, 1])
gene_group = np.array([1, 0, 1, 1, 0, 0, 1, 0])
pattern = np.array([[2, -1], [-1.2, 1.6], [0.4, -0.2]])
i, j = np.meshgrid(np.arange(12), np.arange(8), indexing="ij")
values = pattern[sample_group][:, gene_group] + 0.35 * np.sin(3.1 * i + 1.7 * j + i * j)

row_linkage, column_linkage = linkage(values, "average"), linkage(values.T, "average")
rows = hm.linkage_table(row_linkage, samples)
columns = hm.linkage_table(column_linkage, genes)
# Tree puts leaf k at k, in the order leaves_list gives: sort the heatmap the same way, one
# Rect per cell.
ordered = values[leaves_list(row_linkage)][:, leaves_list(column_linkage)]
R, C = values.shape
y, x = np.meshgrid(np.arange(R), np.arange(C), indexing="ij")
cells = {"x0": x.ravel(), "x1": x.ravel() + 1, "y0": y.ravel(), "y1": y.ravel() + 1,
         "value": ordered.ravel()}
top = np.abs(values).max()
colors = hm.continuous(colormap="RdBu", domain=[-top, top])
hidden = {"visible": False}


def frame(x, y):
    """A Frame beside the heatmap: domain -> range in the Plot's cell units."""
    return hm.Frame(x={"domain": x[0], "range": x[1], **hidden},
                    y={"domain": y[0], "range": y[1], **hidden})


@contextmanager
def tree(table, orientation):
    with hm.GraphData(nodes=table["nodes"], edges=table["edges"]):
        with hm.Tree(root=table["root"], mode="cluster", height="height", orientation=orientation) as layout:
            yield layout


cell_rows = ([-0.5, R - 0.5], [0, R])      # leaf k at k: the center of heatmap row k
cell_columns = ([-0.5, C - 0.5], [0, C])
with hm.Plot(height=480, x={"domain": [-3.2, C + 1.4], **hidden},
             y={"domain": [-0.9, R + 3.2], **hidden}) as plot:
    with hm.Data(cells):
        hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1", fill="value", fill_scale=colors)
    with hm.Data(rows["edges"]):
        # "right": the root at the left, x = -height; elbows go vertical, then horizontal.
        with tree(rows, "right"):
            with frame(([-7, 0], [-3, -0.15]), cell_rows):
                with hm.Edges():
                    hm.Segments(start="start", end="end", curve="step-before",
                                color="#3c4650", width=1.5)
            with frame(([0, 1], [C + 0.15, C + 1.15]), cell_rows):
                with hm.Nodes():  # order is NaN for the merges, so only leaves get labels
                    hm.Text(x=0, y="order", text="label", align="left", size=12)
    with hm.Data(columns["edges"]):
        # "down": the root at the top, y = height; elbows go horizontal, then vertical.
        with tree(columns, "down"):
            with frame(cell_columns, ([0, 9], [R + 0.15, R + 3])):
                with hm.Edges():
                    hm.Segments(start="start", end="end", curve="step-after",
                                color="#3c4650", width=1.5)
            with frame(cell_columns, ([0, 1], [-0.6, 0.4])):
                with hm.Nodes():
                    hm.Text(x="order", y=0, text="label", size=12)
plot
