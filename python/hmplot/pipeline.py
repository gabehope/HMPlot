"""Chained data pipelines (TODO 144): hm.Data(table).filter(...).group_by(...).agg(...).

Each method adds the matching transform (Filter, Calculate, Group, Join, Sort) as a child of the
node it is called on and returns it, so a chain is the nested `with` blocks written left to
right. Nothing is computed in Python: the browser runs the transforms live, on the GPU, as
brushes, selections and inputs change. A chain's last node is the data= of the marks that draw
it, in any Plot of the scene (TODO 142's references); a chain built outside any `with` block is
added to the scene of the marks that read it.

The names are polars' (hm.col already is pl.col's), so an agent's habits from polars carry over;
pandas' names raise an error naming the method to use.
"""
from .core import Node
from .expressions import Expression

# pandas' names for these steps, and what to write instead.
_PANDAS = {
    "groupby": 'group_by: .group_by("region").agg(total=hm.sum("revenue"))',
    "assign": "with_columns: .with_columns(share=hm.col.revenue / hm.sum(\"revenue\"))",
    "merge": 'join: .join(other, on="key")',
    "query": "filter: .filter(hm.col.price > 100)",
    "sort_values": 'sort: .sort("revenue", descending=True)',
    "agg": 'group_by(...).agg(...): .group_by("region").agg(total=hm.sum("revenue")), or group_by() for one row of totals',
    "aggregate": 'group_by(...).agg(...): .group_by("region").agg(total=hm.sum("revenue"))',
    "apply": "with_columns with an expression: .with_columns(double=hm.col.x * 2)",
    "map": "with_columns with an expression: .with_columns(double=hm.col.x * 2)",
    "where": "filter: .filter(hm.col.price > 100)",
    "loc": "filter: .filter(hm.col.price > 100)",
    "iloc": "filter: .filter(hm.row() < 10)",
    "head": "filter: .filter(hm.row() < 10), after a sort",
    "with_column": "with_columns: .with_columns(name=expression)",
}
# What a pipeline holds is computed in the browser, live: Python reads it with await node.read().
_EAGER = ("to_pandas", "to_numpy", "to_dict", "to_list", "values", "shape", "columns", "rows")


class Aliased:
    """An expression with its output name: hm.col.x.sum().alias("total"), a positional argument of
    with_columns and agg (as in polars)."""

    __slots__ = ("name", "expression")

    def __init__(self, name, expression):
        if not isinstance(name, str) or not name:
            raise TypeError(f"alias(name) needs a column name; received {name!r}.")
        self.name, self.expression = name, expression

    def __repr__(self):
        return f"Aliased({self.name!r})"


def _outputs(where, positional, named):
    """with_columns' and agg's outputs: name=expression keywords and .alias()ed expressions."""
    columns = {}
    for item in positional:
        if isinstance(item, Aliased):
            columns[item.name] = item.expression
        elif isinstance(item, dict):
            columns.update(item)
        elif isinstance(item, Expression):
            raise TypeError(f"{where}: name each output: {where}(total=hm.sum(\"revenue\")) or "
                            f"{where}(hm.sum(\"revenue\").alias(\"total\")).")
        else:
            raise TypeError(f"{where} takes name=expression keywords or expressions with .alias(name); "
                            f"received {item!r}.")
    for name in named:
        if name in columns:
            raise TypeError(f"{where}: {name!r} is given twice.")
    columns.update(named)
    if not columns:
        raise TypeError(f"{where} needs at least one output: {where}(total=hm.sum(\"revenue\")).")
    return columns


def _keys(where, values):
    keys = []
    for value in values:
        keys.extend(value if isinstance(value, (list, tuple)) else [value])
    return keys


class GroupBy:
    """node.group_by(...): the keys of a Group whose outputs agg() names. group_by() with no keys
    gives one row of totals."""

    __slots__ = ("_node", "_keys")

    def __init__(self, node, keys):
        self._node, self._keys = node, keys

    def agg(self, *outputs, **named):
        """The Group: one row per key combination, with each output reduced over its rows
        (hm.sum, hm.mean, hm.count, ... or hm.col.x.sum()). Returns the Group node."""
        import hmplot as hm
        columns = _outputs("agg", outputs, named)
        props = {"columns": columns}
        if self._keys:
            props["by"] = self._keys[0] if len(self._keys) == 1 else list(self._keys)
        return self._node._chain(hm.Group, **props)

    def len(self, name="len"):
        """The Group with each key's row count, named `name` (polars' group_by().len())."""
        import hmplot as hm
        return self.agg(**{name: hm.count()})

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        if name in ("sum", "mean", "count", "min", "max", "median", "std", "var", "first", "last", "size"):
            raise AttributeError(f"group_by(...).{name}() is pandas': name the outputs in agg: "
                                 f'.group_by(...).agg(total=hm.sum("revenue")), or .len() for row counts.')
        raise AttributeError(f"group_by(...) has agg() and len(); {name!r} is not one of them.")


class Pipeline(Node):
    """A node whose output other nodes read: Data and the transforms. The chain methods add a
    transform under it and return that transform."""

    def _chain(self, cls, **props):
        # A chain from a detached hm.Data is checked in the scenes whose marks read it
        # (Node._changed, Scene._check_pipeline_references), not as a scene of its own.
        root = self
        while root.parent is not None:
            root = root.parent
        if root.kind == "Data" and root._implicit is None:
            root._chain_root = True
        # Created inside this node's block: attached here, as `with self: cls(...)` would.
        with self:
            return cls(**{key: value for key, value in props.items() if value is not None})

    def filter(self, *predicates, inactive=None):
        """Keep the rows where every predicate holds: an expression (hm.col.price > 100), an
        interaction column ("@brushed"), a selection, or an input comparison. inactive says what a
        predicate on a selection or brush keeps while nothing is selected ("all", the default,
        or "none"). Returns the Filter."""
        import hmplot as hm
        if not predicates:
            raise TypeError('filter needs a predicate: .filter(hm.col.price > 100) or .filter("@brushed").')
        where = predicates[0] if len(predicates) == 1 else list(predicates)
        return self._chain(hm.Filter, where=where, inactive=inactive)

    def with_columns(self, *outputs, **named):
        """Add (or replace) columns computed by expressions, one value per row:
        .with_columns(share=hm.col.revenue / hm.sum("revenue")). Returns the Calculate."""
        import hmplot as hm
        return self._chain(hm.Calculate, columns=_outputs("with_columns", outputs, named))

    def group_by(self, *by):
        """Group by key columns (or hm.bin(...) keys); .agg(...) names the outputs and returns the
        Group. group_by() with no keys gives one row of totals."""
        return GroupBy(self, _keys("group_by", by))

    def join(self, other, on=None, *, how="left", left_on=None, right_on=None, fields=None):
        """Add another table's columns by key. `other` is a table (a dict, DataFrame or hm.Table),
        an hm.Data or a pipeline (a live Group of brushed rows, ...). how="left" (the default)
        keeps every row of this one, with missing values where no key matches; "inner" keeps only
        the matches. fields names the columns to add (every column but the key by default).
        Returns the Join."""
        import hmplot as hm
        if how not in ("left", "inner"):
            raise ValueError(f'join: how is "left" or "inner"; received {how!r}.')
        return self._chain(hm.Join, data=other, on=on, how=how, left_on=left_on, right_on=right_on,
                           fields=fields)

    def sort(self, by, *more_by, descending=False):
        """Sort the rows by one or more columns (ties keep their order; missing values go last).
        Returns the Sort."""
        import hmplot as hm
        if isinstance(descending, (list, tuple)):
            raise TypeError("sort: descending is one True or False for every key.")
        keys = _keys("sort", (by, *more_by))
        return self._chain(hm.Sort, by=keys[0] if len(keys) == 1 else keys,
                           order="desc" if descending else "asc")

    def collect(self):
        """This node: a pipeline is computed live in the browser, so there is nothing to collect.
        Pass it as data= to the marks that draw it; ``await node.read()`` reads its rows."""
        return self

    async def read(self, columns=None, *, view=None, timeout=60):
        """The rows this node holds now in a displayed scene, as the browser computed them (after a
        brush, a selection or an input moved them): a dict of column name to NumPy array
        (numbers as float64 with NaN where missing, times as datetime64[ms], text as object).
        ``pandas.DataFrame(await node.read())`` makes a frame. ``columns`` picks and orders them.
        One read per call, bounded by limit.readback (TODO 145.1)."""
        if columns is not None:
            columns = [columns] if isinstance(columns, str) else list(columns)
        from .exporter import _NOTEBOOK_MESSAGE_LIMIT
        result = await _reading_scene(self)._command(
            "read", self.id, view=view, timeout=timeout, columns=columns, maxBytes=_NOTEBOOK_MESSAGE_LIMIT)
        return _host_columns(result)

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        if name in _PANDAS:
            raise AttributeError(f"{self.kind}.{name} is pandas'; HMPlot's pipelines use polars' names. "
                                 f"Use {_PANDAS[name]}.")
        if name in _EAGER:
            raise AttributeError(f"{self.kind}.{name}: a pipeline is computed live in the browser. Pass it as "
                                 "data= to a mark; once the scene is displayed, `await node.read()` reads its "
                                 "rows as they are now (pandas.DataFrame(await node.read()) for a frame).")
        # Anything else fails as it would without this hook (a property's own error included).
        return object.__getattribute__(self, name)


def _reading_scene(node):
    """The displayed scene ``node`` is in: its own, or for a chain adopted by scenes (TODO 144),
    the first of those with a view."""
    from .core import Scene
    root = node
    while root.parent is not None:
        root = root.parent
    if isinstance(root, Scene):
        return root
    shown = [scene for scene in getattr(root, "_adopters", ()) if scene.views]
    return shown[0] if shown else node._scene()


def _host_columns(result):
    """The browser's table (scene/runtime.svelte.js wireTable) as NumPy arrays."""
    import numpy as np
    out = {}
    for name, values in (result or {}).get("columns", {}).items():
        present = [v for v in values if v is not None]
        if present and all(isinstance(v, dict) and "$datetime" in v for v in present):
            out[name] = np.array([np.datetime64(int(v["$datetime"]), "ms") if v is not None else np.datetime64("NaT", "ms")
                                  for v in values], dtype="datetime64[ms]")
        elif present and all(isinstance(v, list) for v in present):
            width = len(present[0])
            out[name] = np.array([[np.nan if x is None else x for x in v] if v is not None else [np.nan] * width
                                  for v in values], dtype=float)
        elif all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in present):
            out[name] = np.array([np.nan if v is None else v for v in values], dtype=float)
        else:
            out[name] = np.array(values, dtype=object)
    return out
