"""Tree tables from a hierarchical clustering (TODO 39.3): hm.linkage_table."""
import math

import numpy as np


def linkage_table(Z, labels=None):
    """The tables ``hm.Tree`` draws a dendrogram from, made from a SciPy linkage matrix.

    ``Z`` is the ``(n - 1) x 4`` matrix ``scipy.cluster.hierarchy.linkage`` returns: row ``i``
    merges clusters ``Z[i, 0]`` and ``Z[i, 1]`` at distance ``Z[i, 2]`` into a cluster of
    ``Z[i, 3]`` observations. As in SciPy, the leaves are nodes ``0 .. n - 1`` and row ``i``
    makes node ``n + i``. ``labels`` names the ``n`` observations (default ``"0"``, ``"1"``, ...).

    Returns a dict of plain lists:

    - ``"edges"``: ``{"source": [...], "target": [...]}``, one row per parent-child link: each
      merge's two children, in Z's order;
    - ``"nodes"``: ``{"id": [...], "label": [...], "height": [...], "count": [...]}``, one row
      per node, the leaves first (their label, height 0, count 1), then the merges (label None,
      height ``Z[i, 2]``, count ``Z[i, 3]``);
    - ``"root"``: the root's id, ``2 * n - 2``.

    Lay it out with ``mode="cluster"`` and ``height="height"``, as below. The Tree puts the
    leaves at 0, 1, ..., n - 1 across (its ``order`` column), in the order
    ``dendrogram(Z)["leaves"]`` and ``leaves_list(Z)`` give, so a heatmap of
    ``X[leaves_list(Z)]`` lines its rows up with them. Only NumPy is needed here.

    Example:
        Z = [[0, 1, 1.0, 2], [2, 3, 2.5, 3]]
        tree = hm.linkage_table(Z, ["a", "b", "c"])
        with hm.Plot(height=300) as plot:
            with hm.GraphData(nodes=tree["nodes"], edges=tree["edges"]):
                with hm.Tree(root=tree["root"], mode="cluster",
                             height="height", orientation="down"):
                    with hm.Edges():
                        hm.Segments(start="start", end="end", curve="step-after")
    """
    try:
        matrix = np.asarray(Z, dtype=float)
    except (TypeError, ValueError):
        raise TypeError("linkage_table: Z must be a numeric linkage matrix, as "
                        "scipy.cluster.hierarchy.linkage returns.") from None
    if matrix.size == 0:  # one observation: no merges
        matrix = matrix.reshape(0, 4)
    if matrix.ndim != 2 or matrix.shape[1] != 4:
        raise ValueError("linkage_table: Z must be a linkage matrix of shape (n - 1, 4), as "
                         f"scipy.cluster.hierarchy.linkage returns; got shape {matrix.shape}.")
    n = matrix.shape[0] + 1
    if labels is None:
        names = [str(i) for i in range(n)]
    else:
        names = [value.item() if isinstance(value, np.generic) else value for value in labels]
        if len(names) != n:
            raise ValueError(f"linkage_table: labels has {len(names)} entries, but Z joins {n} leaves.")
    merged = {}
    source, target = [], []
    heights, counts = [0.0] * n, [1] * n
    for i, (a, b, distance, count) in enumerate(matrix):
        for child in (a, b):
            if not (child.is_integer() and 0 <= child < n + i):
                raise ValueError(f"linkage_table: Z row {i} merges node {child:g}, which does not "
                                 f"exist yet (row {i} can merge nodes 0 to {n + i - 1}).")
            if int(child) in merged:
                raise ValueError(f"linkage_table: node {int(child)} is merged twice, in Z rows "
                                 f"{merged[int(child)]} and {i}.")
            merged[int(child)] = i
            source.append(n + i)
            target.append(int(child))
        if not math.isfinite(distance) or distance < 0:
            raise ValueError(f"linkage_table: Z row {i} has distance {distance}; distances must "
                             "be finite and nonnegative.")
        heights.append(float(distance))
        counts.append(int(count))
    return {
        "edges": {"source": source, "target": target},
        "nodes": {
            "id": list(range(2 * n - 1)),
            "label": names + [None] * (n - 1),
            "height": heights,
            "count": counts,
        },
        "root": 2 * n - 2,
    }
