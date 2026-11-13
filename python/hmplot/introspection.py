"""Visualize the structural component tree with HMPlot's own marks."""
from __future__ import annotations

import re

import numpy as np

from .core import CHANNELS, Node, REGISTRY, Template, _facet_cell_plot, _input_reads, _label, _snake
from .data import BUILTIN_SHAPES, Column, Literal, Table, _SHAPES
from .expressions import Expression

# A node's role is its component's group (the registry's, from src/lib/scene/options.json),
# so a new component always has one. Groups the colors don't list draw gray.
_GROUP_COLORS = {
    "Plot and layout": "#547ba2",
    "Marks": "#a278a4",
    "3D marks": "#bc7180",
    "Transforms": "#cf8955",
    "Scales and legends": "#838997",
    "Interaction": "#579b9a",
    "Inputs": "#c4a451",
    "Data sources": "#7b9865",
    "Maps and tiles": "#5f9ec7",
    "Graphs": "#8c6d52",
}
# The parent of the tree's root: a node the drawing leaves out (see visualize_tree).
_TOP = "(top)"
# Channels where a plain string may be a color: it counts as a column read only when it names a
# column the node can see.
_COLOR_CHANNELS = {"fill", "color", "outlineColor"}
# Transforms that keep their input's columns (Calculate's new ones are counted by name).
_SAME_COLUMNS = {"Filter", "Sort", "Sample", "Slice", "Calculate"}
_INFIX = {"add": "+", "subtract": "-", "multiply": "*", "divide": "/", "power": "**",
          "equal": "==", "not_equal": "!=", "less": "<", "less_equal": "<=", "greater": ">",
          "greater_equal": ">=", "logical_and": "&", "logical_or": "|"}


def _role(kind: str) -> str:
    return REGISTRY["components"][kind]["group"]


def _short(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _expression_text(value) -> str:
    """An expression as the docs write it: columns by name, $input, @state, op(args)."""
    if not isinstance(value, Expression):
        return _value_text(value)
    op, args = value.op, value.args
    if op == "column":
        return args[0]
    if op == "input":
        return f"${args[0]}"
    if op == "state":
        return f"@{args[0]}"
    if op in _INFIX and len(args) == 2:
        return f"({_expression_text(args[0])} {_INFIX[op]} {_expression_text(args[1])})"
    if op == "logical_not":
        return f"~{_expression_text(args[0])}"
    if op == "negative":
        return f"-{_expression_text(args[0])}"
    parts = []
    for arg in args:
        if isinstance(arg, dict) and "$expression_options" in arg:
            parts += [f"{key}={_value_text(item)}" for key, item in arg["$expression_options"].items()]
        elif isinstance(arg, str):
            parts.append(arg)
        elif arg is not None:
            parts.append(_expression_text(arg))
    return f"{op}({', '.join(parts)})"


def _value_text(value) -> str:
    """A prop's value, shortly."""
    if isinstance(value, Expression):
        return _expression_text(value)
    if isinstance(value, Table):
        return f"<table, {_rows(value)} rows>"
    if isinstance(value, Column):
        return f"<{value.shape[0] if value.shape else 1} values>"
    if isinstance(value, Literal):
        return f"literal({_value_text(value.value)})"
    if isinstance(value, Node):
        return _label(value)
    if isinstance(value, dict):
        return _short("{" + ", ".join(f"{key}: {_value_text(item)}" for key, item in value.items()) + "}", 60)
    if isinstance(value, (list, tuple)):
        return _short("[" + ", ".join(_value_text(item) for item in value) + "]", 60)
    if value is None or isinstance(value, (str, bool, int, float)):
        return repr(value)
    return type(value).__name__


def _rows(table: Table) -> int:
    return next((column.shape[0] for column in table.columns.values() if column.shape), 0)


def _table(node: Node):
    """The table a node holds: a Data's value, a Plot's, Facet's or Nodes' data, a mark's own data."""
    if node._local_data is not None:
        return node._local_data
    for key in ("value", "data", "initial"):
        if isinstance(node.props.get(key), Table):
            return node.props[key]
    return None


def _expression_columns(value, found: list) -> None:
    if isinstance(value, Expression):
        if value.op == "column":
            name = value.args[0]
            found.append(name[len("@prev:"):] if name.startswith("@prev:") else name)
        elif value.op not in ("state", "input"):
            for arg in value.args:
                if isinstance(arg, str):
                    if not arg.startswith("@"):
                        found.append(arg)
                elif isinstance(arg, dict) and "$expression_options" in arg:
                    for key in ("by", "orderBy"):
                        by = arg["$expression_options"].get(key)
                        found.extend([by] if isinstance(by, str) else by or [])
                else:
                    _expression_columns(arg, found)
    elif isinstance(value, dict):
        for item in value.values():
            _expression_columns(item, found)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _expression_columns(item, found)


def _visible_columns(node: Node) -> tuple[set, bool]:
    """Columns a node can see, as far as Python knows: its table's, and those the transforms
    around it name (Calculate's outputs, renames, reducers); and whether that is all of them,
    which it is unless a transform or a layout between makes columns of its own."""
    names, exact = set(), True
    table = node._data_resource()
    if isinstance(table, Table):
        names |= set(table.columns)
    parent = node.parent
    while parent is not None and not (_table(parent) is table and table is not None):
        for key in ("columns", "as", "reduce"):
            value = parent.props.get(key)
            if isinstance(value, dict):
                names |= set(value) | {item for item in value.values() if isinstance(item, str)}
        if _role(parent.kind) in ("Transforms", "Graphs") and parent.kind not in _SAME_COLUMNS:
            exact = False
        parent = parent.parent
    return names, exact and table is not None


def _prop_type(kind: str, key: str) -> str:
    from ._components import _signatures
    return _signatures.get(kind, {}).get(_snake(key), "Any")


def _reads(node: Node) -> tuple[list, list]:
    """The columns and inputs a node's props name, in order, each once.

    Columns: hm.col and the strings inside expressions, ":x" strings, and plain strings in a
    column's place (a channel, or a parameter that reads inputs) that are not one of the
    parameter's fixed options or a shape's name. A color string counts only when it names a
    column the node can see, and a text string too where Python knows every column there.
    Inputs: hm.input and "$x".
    """
    component = REGISTRY["components"].get(node.kind, {})
    places = set(component.get("stringReads", ()))
    if node.kind in REGISTRY["marks"]:
        places |= CHANNELS | {"text", "series"}
    columns, inputs, visible = [], [], None
    for key, value in node.props.items():
        inputs.extend(_input_reads(value, key in places))
        _expression_columns(value, columns)
        if key not in places or key == "root":
            continue
        kind = _prop_type(node.kind, key)
        options = set(re.findall(r'"([^"]*)"', kind))
        takes_strings = kind == "Any" or re.search(r"\b(str|Channel)\b", kind) is not None
        for text in value if isinstance(value, (list, tuple)) else [value]:
            if not isinstance(text, str) or not text or text[0] in "$@":
                continue
            if text[0] == ":":
                columns.append(text[1:])
            elif takes_strings and text not in options:
                if key == "shape" and (text in BUILTIN_SHAPES or text in _SHAPES):
                    continue
                if key in _COLOR_CHANNELS or key == "text":
                    names, exact = _visible_columns(node) if visible is None else visible
                    visible = names, exact
                    if text not in names and (key != "text" or exact):
                        continue
                columns.append(text)
    return list(dict.fromkeys(columns)), list(dict.fromkeys(inputs))


def _node_info(node: Node) -> dict:
    """A node's tooltip fields: its kind and group, the props set on it, the columns and inputs
    it reads, and for a table its rows and columns, for a template its class."""
    columns, inputs = _reads(node)
    table = _table(node)
    table_text = None
    if table is not None:
        names = list(table.columns)
        table_text = _short(f"{_rows(table)} rows, {len(names)} columns: {', '.join(names)}", 120)
    props = ", ".join(f"{_snake(key)}={_value_text(value)}" for key, value in node.props.items())
    return {
        "kind": node.kind,
        "group": _role(node.kind),
        "props": _short(props, 160) if props else None,
        "columns": ", ".join(columns) or None,
        "inputs": ", ".join(inputs) or None,
        "table": table_text,
        "class": type(node).__name__ if isinstance(node, Template) else None,
    }


def _facet_cells(node: Node):
    """Enumerate the cells represented by a host-backed Facet definition."""
    row, column = node.props.get("row"), node.props.get("column")
    if not row and not column:
        return None
    table = node._data_resource()
    if table is None:
        raise ValueError("split_facet requires a Data table for each Facet.")

    def domain(field, order):
        if not field:
            return [None]
        if order is not None:
            return list(order)
        source = table.columns.get(field)
        if source is None:
            raise ValueError(f"split_facet cannot find Facet field {field!r} in its Data table.")
        if source.categories is None:
            raise ValueError(
                f"split_facet needs an explicit order for numeric Facet field {field!r}."
            )
        codes = np.frombuffer(source.payload, dtype="<i4")
        present = set(codes.tolist())
        return [value for index, value in enumerate(source.categories) if index in present]

    rows = domain(row, node.props.get("rowOrder"))
    columns = domain(column, node.props.get("columnOrder"))
    return [
        " · ".join(f"{field}={value}" for field, value in ((row, r), (column, c)) if field)
        for r in rows for c in columns
    ]


def visualize_tree(obj: Node, *, split_facet: bool = False) -> Node:
    """Return a Plot showing an object's component tree.

    Labels are component kinds; a template shows its class name ("Panel (template)"). Colors
    are the components' groups. Hovering a node shows its kind, group, props, the columns and
    inputs it reads, a table's rows and columns and a template's class, and highlights the path
    from it to the root and its subtree. With split_facet=True, each Facet cell gets a separate
    branch containing its repeated definition. The source object is only read; the returned
    Plot is independent.
    """
    if not isinstance(obj, Node):
        raise TypeError(f"visualize_tree expects an HMPlot component, such as a Plot or Scene; received "
                        f"{type(obj).__name__}.")
    import hmplot as hm

    # A row per node, in depth-first order: its parent, and its place `pre` and the last place
    # in its subtree `last`, so a node's subtree is the places pre..last.
    fields = ("node_id", "parent_id", "name", "pre", "last", "kind", "group", "props", "columns",
              "inputs", "table", "class")
    rows = {field: [] for field in fields}
    seen = set()
    max_depth = 0

    def add(node_id, parent_id, name, info):
        rows["node_id"].append(node_id)
        rows["parent_id"].append(parent_id)
        rows["name"].append(name)
        rows["pre"].append(len(rows["pre"]))
        rows["last"].append(0)
        for field in fields[5:]:
            rows[field].append(info.get(field))
        return len(rows["pre"]) - 1

    def visit(node: Node, parent_id: str, depth: int, scope: str = "") -> None:
        nonlocal max_depth
        identity = (scope, id(node))
        if identity in seen:
            raise ValueError("Component tree contains a repeated node.")
        seen.add(identity)
        node_id = scope + node.id
        name = f"{_label(node)} (template)" if isinstance(node, Template) else node.kind
        index = add(node_id, parent_id, name, _node_info(node))
        max_depth = max(max_depth, depth)
        cells = _facet_cells(node) if split_facet and node.kind == "Facet" else None
        implicit = _facet_cell_plot(node)

        def children(parent_id, depth, scope):
            # A Facet around marks makes the cell Plot they need (TODO 129.2): shown, as implicit.
            nonlocal max_depth
            if implicit:
                plot_id = f"{parent_id}:plot"
                plot = add(plot_id, parent_id, "Plot (implicit)",
                           {"kind": "Plot", "group": _role("Plot"), "props": "implicit: the Facet's cell Plot"})
                max_depth = max(max_depth, depth)
                parent_id, depth = plot_id, depth + 1
            for child in node.children:
                visit(child, parent_id, depth, scope)
            if implicit:
                rows["last"][plot] = len(rows["pre"]) - 1

        if cells is not None:
            for number, label in enumerate(cells):
                cell_id = f"{node_id}:cell:{number}"
                cell = add(cell_id, node_id, f"Facet: {label}",
                           {"kind": "Facet cell", "group": _role("Facet"), "props": label})
                max_depth = max(max_depth, depth + 1)
                children(cell_id, depth + 2, cell_id + "/")
                rows["last"][cell] = len(rows["pre"]) - 1
        else:
            children(node_id, depth + 1, scope)
        rows["last"][index] = len(rows["pre"]) - 1

    # The root's parent is a node above it that nothing draws. The Tree's Edges then have a row
    # per node, from its parent to it, carrying the node's columns: the marks are drawn there,
    # and a hovered point's row is the node's.
    visit(obj, _TOP, 0)
    groups = [group for group in dict.fromkeys(_role(kind) for kind in REGISTRY["components"])
              if group in rows["group"]]
    palette = hm.categorical(domain=groups, range=[_GROUP_COLORS.get(group, "#92989f") for group in groups])
    # The tooltip lists the fields some node has; its title is the group, which fill names.
    labels = {"columns": "columns read", "inputs": "inputs read"}
    tooltip = [{"field": "kind"}]
    for field in ("props", "columns", "inputs", "table", "class"):
        if any(rows[field]):
            tooltip.append({"field": field, "label": labels.get(field, field)})
        else:
            del rows[field]
    # Path highlighting: the pointed node's places (a reduction over @nearest, which marks the
    # row the tooltip shows, TODO 72) lie inside an ancestor's span, and its subtree's places
    # inside its own span.
    hovered = hm.max(hm.where(hm.view.nearest, hm.col.pre, -1))
    hovered_last = hm.max(hm.where(hm.view.nearest, hm.col.last, -1))
    ancestor = (hm.col.pre <= hovered) & (hovered <= hm.col.last)
    descendant = (hovered <= hm.col.pre) & (hm.col.pre <= hovered_last)
    shown = hm.where(hm.view.any_nearest, hm.where("on_path", 1, 0.25), 1)
    with hm.Data(rows, key="node_id"):
        with hm.GraphData(source="parent_id", target="node_id"):
            with hm.Tree(root=_TOP):
                with hm.Plot(
                    title="Visualization tree",
                    height=max(320, min(900, 160 + max_depth * 100)),
                    axes2d=False,
                ) as plot:
                    with hm.Edges():
                        with hm.Calculate(on_path=ancestor | descendant):
                            # The root's edge comes from the node above it.
                            with hm.Filter(where=hm.col.pre > 0):
                                hm.Segments(start="start", end="end", color="#aab5bf", width=1, opacity=shown)
                                with hm.Filter(where=hm.col.on_path > 0):
                                    hm.Segments(start="start", end="end", color="#5d6b78", width=2)
                            points = hm.Points(position="end", fill="group", fill_scale=palette, size=12,
                                               opacity=shown, respond=False, tooltip=tooltip)
                            hm.Text(position="end", text="name", size=12, dy=-16,
                                    color="#30343b", opacity=shown)
                    hm.Legend(target=points, channel="fill", label="Group", position="bottom")
    return plot
