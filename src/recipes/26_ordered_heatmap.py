"""Ordered gene heatmap with a condition strip
Supply a leaf order (or scipy.cluster.hierarchy.leaves_list(linkage(matrix))); reorder values and labels together. Categorical axes measure label margins."""
import numpy as np
import hmplot as hm

genes = np.array([f"GENE_LONG_{i + 1:02}" for i in range(40)])
samples = ["Control 1", "Control 2", "Treated 1", "Treated 2"]
matrix = np.sin(np.arange(40)[:, None] + np.arange(4)) * 2
order = np.argsort(matrix[:, 0])  # Replace with supplied clustering leaf order.
ordered = matrix[order].copy()  # Keep the original matrix in its original row order.
x = {"scale": hm.categorical(domain=samples), "label": "Sample"}
colors = hm.continuous(domain=[-2, 2], colormap="RdBu")
conditions = hm.categorical(domain=["Control", "Treated"], range=["#4477aa", "#ee6677"])
with hm.Plot(height=960, x=x, y={"scale": hm.categorical(domain=["Condition", *genes[order]])}) as chart:
    heatmap = hm.Heatmap(fill=np.vstack([np.zeros((1, 4)), ordered]), fill_scale=colors, pixelated=True)
    strip = hm.Rect(x0=[-0.5, 0.5, 1.5, 2.5], x1=[0.5, 1.5, 2.5, 3.5], y0=-0.5, y1=0.5,
                fill=["Control", "Control", "Treated", "Treated"], fill_scale=conditions)
    hm.Legend(target=heatmap, channel="fill", label="Expression (z score)")
    hm.Legend(target=strip, channel="fill", label="Condition")
chart
