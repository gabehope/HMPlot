"""Reference: correlation clustering, correctly positioned dendrograms and gene hover."""
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import linkage, leaves_list, dendrogram
import hmplot as hm

Path("output").mkdir(exist_ok=True)
raw = pd.read_csv("data/expression.csv")
matrix = raw.pivot(index="gene", columns="sample", values="log2_expression")
z = (matrix.to_numpy() - matrix.to_numpy().mean(axis=1, keepdims=True)) / matrix.to_numpy().std(axis=1, keepdims=True)
rows = linkage(z, method="average", metric="correlation")
cols = linkage(z.T, method="average", metric="correlation")
genes = matrix.index[leaves_list(rows)].tolist()
samples = matrix.columns[leaves_list(cols)].tolist()
R, C = matrix.shape
frame = raw.copy()
frame["x"] = frame["sample"].map({s: i for i, s in enumerate(samples)})
frame["y"] = frame.gene.map({g: R - 1 - i for i, g in enumerate(genes)})
means = frame.groupby("gene").log2_expression.transform("mean")
std = frame.groupby("gene").log2_expression.transform(lambda v: v.std(ddof=0))
frame["zscore"] = (frame.log2_expression - means) / std
def branches(tree, vertical):
    d = dendrogram(tree, no_plot=True)
    start, end = [], []
    max_height = max(max(v) for v in d["dcoord"])
    for locations, heights in zip(d["icoord"], d["dcoord"]):
        points = ([(-0.8 - 2.6 * h / max_height, R - 1 - (v - 5) / 10)
                   for v, h in zip(locations, heights)] if vertical else
                  [((v - 5) / 10, R + 0.7 + 4 * h / max_height)
                   for v, h in zip(locations, heights)])
        start.extend(points[:-1]); end.extend(points[1:])
    return {"start": start, "end": end}
conditions = frame.drop_duplicates("sample").set_index("sample").loc[samples, "condition"].tolist()
strip = {"x": np.arange(C), "condition": conditions}
condition_colors = hm.categorical(domain=sorted(raw.condition.unique()), range=["#447cad", "#e5a14a"])
limit = float(frame.zscore.abs().max())
hover_gene = hm.any(hm.view.hovered, by="gene")
selected_gene = hm.where(hm.view.any_hovered, hover_gene, hm.col.gene == hm.literal(genes[0]))
with hm.Scene() as chart:
    with hm.Data(frame):
        with hm.Row(widths=[1.65, 1], gap=25):
            with hm.Plot(title="Gene expression", height=740, axes2d=False,
                         x={"domain": [-3.6, C + 0.2]}, y={"domain": [-0.7, R + 5.2]}):
                hm.Segments(data=branches(rows, True), start="start", end="end", color="#536375", width=1)
                hm.Segments(data=branches(cols, False), start="start", end="end", color="#536375", width=1)
                cells = hm.Rect(x0=hm.col.x - 0.5, x1=hm.col.x + 0.5,
                                y0=hm.col.y - 0.5, y1=hm.col.y + 0.5,
                                fill="zscore", fill_scale=hm.continuous(domain=[-limit, limit], colormap="RdBu"),
                                hover=True, tooltip=["gene", "sample", "condition", "log2_expression", "zscore"])
                band = hm.Rect(data=strip, x0=hm.col.x - 0.5, x1=hm.col.x + 0.5,
                               y0=R, y1=R + 0.4, fill="condition", fill_scale=condition_colors)
                hm.Legend(target=cells, channel="fill", label="Gene z-score", position="right")
                hm.Legend(target=band, channel="fill", label="Condition", position="top")
            with hm.Plot(title="Expression by condition", height=740,
                         x={"label": "Condition"}, y={"label": "log2 expression"}):
                with hm.Filter(where=selected_gene):
                    hm.charts.BoxPlot(x="condition", y="log2_expression", fill="condition", fill_scale=condition_colors)
                    hm.Points(x="condition", y="log2_expression", size=4, fill="#25475f", opacity=0.65,
                              tooltip=["gene", "sample", "log2_expression"])
hm.export_html(chart, "output/chart.html")
