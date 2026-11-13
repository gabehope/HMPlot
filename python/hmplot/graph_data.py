"""GraphData's Python handling (docs/COMPOSITION.md): its node and edge tables and their ID
columns, in three stages. Both tables are optional (TODO 137.3 folded FromEdges in): without
nodes= the browser infers them from the edges, and without edges= the surrounding data are the
edges.

1. Property normalization (``normalize_property`` for each assigned property, then
   ``normalize`` on the assembled props): ``nodes=`` and ``edges=`` become Tables, and the ID
   column properties become column names.
2. Component validation (``validate_component``): nodes= comes with edges=, the tables have the
   ID columns, and the node IDs are present, finite and unique. Node._set runs stages 1 and 2 on every assignment.
3. Scene validation (``validate_scene``): the same checks of the tables as they are when the
   scene is validated, since a Table can change after it was assigned (``table.replace``).

Layouts and transforms below a GraphData validate their current views in the browser.
"""
from __future__ import annotations

import math

from .data import Table, _key_values

KIND = "GraphData"
_ID_COLUMNS = ("nodeKey", "source", "target")


def normalize_property(node, name, value, props, from_browser):
    """Stage 1, one property of an assignment (``props``, as Node._set received it): a
    ``nodes=`` or ``edges=`` value that is not a Table becomes one, the nodes keyed by
    ``node_key`` (from the same assignment, else the node's current one)."""
    if name not in ("nodes", "edges") or value is None or isinstance(value, Table):
        return value
    from .core import _column_names, _has_template_param

    node_key = props.get("nodeKey" if from_browser else "node_key", node.props.get("nodeKey", "id"))
    node_key = None if _has_template_param(node_key) else _column_names(node_key)
    try:
        return Table(value, key=node_key if name == "nodes" else None)
    except ValueError as error:
        raise ValueError(f"GraphData.{name}: {error}") from error


def normalize(props):
    """Stage 1, the assembled props: the ID columns as names (hm.col.id and ":id" are "id")."""
    from .core import _column_names

    for name in _ID_COLUMNS:
        if name in props:
            props[name] = _column_names(props[name])


def validate_component(node):
    """Stage 2: the node's tables and ID columns, after an assignment."""
    _check(node)


def validate_scene(node):
    """Stage 3: the node's tables as they are when its scene is validated."""
    _check(node)


def _check(node):
    """Check the explicit graph tables, skipping the ID checks while the node ID columns are the
    ones last checked (the signature remembered on the node)."""
    node._graph_validation = _check_tables(node.props, getattr(node, "_graph_validation", None))


def _check_tables(props, checked=None):
    from .core import _has_template_param

    if _has_template_param(props):
        return
    nodes, edges = props.get("nodes"), props.get("edges")
    if nodes is not None and edges is None:
        raise TypeError("GraphData: pass edges= with nodes=, or omit both to read the edges from the surrounding data.")
    node_key, source, target = (props.get(name, default) for name, default in
                                (("nodeKey", "id"), ("source", "source"), ("target", "target")))
    for name, field in (("node_key", node_key), ("source", source), ("target", target)):
        if not isinstance(field, str) or not field:
            raise ValueError(f"GraphData.{name}: pass a nonempty column name.")
    if edges is not None:
        for field in (source, target):
            if field not in edges.columns:
                raise ValueError(f"GraphData: missing endpoint column {field!r}; pass source= and target= for the edge ID columns.")
    if nodes is None:
        if node_key != "id":
            raise ValueError(f"GraphData.node_key names a column of nodes=; inferred nodes' IDs are id, so omit node_key={node_key!r} or pass nodes=.")
        return None
    if node_key not in nodes.columns:
        raise ValueError(f"GraphData: missing node key column {node_key!r}; pass node_key= for the node ID column.")
    signature = (node_key, nodes.columns[node_key].id,
                 nodes.columns['id'].id if node_key != 'id' and 'id' in nodes.columns else None)
    if checked == signature:
        return signature
    keys = _key_values(nodes.columns[node_key])
    def token(value):
        return ("number" if isinstance(value, (int, float)) and not isinstance(value, bool)
                else type(value).__name__, value)
    if any(value is None or isinstance(value, float) and not math.isfinite(value) for value in keys):
        raise ValueError("GraphData: node IDs must be present and finite.")
    if len({token(value) for value in keys}) != len(keys):
        raise ValueError("GraphData: node IDs must be unique; pass a node_key that differs for every row.")
    if node_key != "id" and "id" in nodes.columns:
        supplied = _key_values(nodes.columns["id"])
        if [token(value) for value in supplied] != [token(value) for value in keys]:
            raise ValueError(f"GraphData: supplied id conflicts with node_key {node_key!r}; omit id or make it identical to the node key.")
    return signature
