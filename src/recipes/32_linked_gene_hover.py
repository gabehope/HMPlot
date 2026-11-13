"""Hover a gene in one table to highlight its rows in another
hm.selection(by="gene") selects values: a gene hovered on the left fades the other genes' samples on the right
(respond=) and enlarges its own (an expression reads the selection per row)."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(3)
names = ["BRCA1", "TP53", "EGFR", "MYC", "KRAS"]
genes = hm.Table({"gene": names, "length": [81, 19, 188, 5, 46], "expression": [4.1, 6.3, 2.2, 7.5, 3.8]})
samples = hm.Table({"gene": np.repeat(names, 30), "sample": np.tile(np.arange(30), 5),
                    "value": rng.normal(np.repeat([4.1, 6.3, 2.2, 7.5, 3.8], 30), 0.6)})
focus = hm.selection(by="gene")

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(data=genes, height=320, title="Genes: hover one"):
            hm.Points(x="length", y="expression", size=12, hover=focus, respond=focus)
        with hm.Plot(data=samples, height=320, title="Samples of the hovered gene"):
            hm.Points(x="sample", y="value", fill="gene", size=hm.where(focus, 8, 4), respond=focus)
chart
