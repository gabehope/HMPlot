"""Chained pipelines (TODO 144): hm.Data(table).filter(...).group_by(...).agg(...) builds the same
transforms as nested blocks, a chain built outside any block is sent with the scene that reads it,
and pandas' names say which method to use."""
import pytest

import hmplot as hm


def shape(node):
    """A serialized node without ids: kind, the props that say what it computes, children."""
    keep = ("where", "by", "columns", "on", "how", "fields", "order", "inactive")
    props = {k: v for k, v in node["props"].items() if k in keep}
    return [node["kind"], props, [shape(c) for c in node["children"]]]


def strip(value):
    if isinstance(value, dict):
        return {k: strip(v) for k, v in value.items() if k not in ("$ref", "$table")}
    if isinstance(value, list):
        return [strip(v) for v in value]
    return value


SALES = {"region": ["N", "N", "S"], "product": ["a", "b", "a"], "revenue": [1.0, 2.0, 3.0]}


def test_a_chain_builds_the_nested_transforms():
    nested_table, chained_table = hm.Table(SALES), hm.Table(SALES)
    with hm.Scene() as nested:
        with hm.Data(nested_table):
            with hm.Filter(where=hm.col.revenue > 1):
                with hm.Calculate(columns={"double": hm.col.revenue * 2}):
                    hm.Group(by="region", columns={"total": hm.sum("double")})
    with hm.Scene() as chained:
        sales = hm.Data(chained_table)
        totals = (sales.filter(hm.col.revenue > 1)
                       .with_columns(double=hm.col.revenue * 2)
                       .group_by("region").agg(total=hm.sum("double")))
    assert isinstance(totals, hm.Group)
    # A reduction as a method is the same reduction of the column.
    method = hm.col.double.sum(by="region")
    assert method.op == "sum" and method.args[0].args == ("double",) and method.args[1] == {"$expression_options": {"by": "region"}}
    a, _ = nested._snapshot()
    b, _ = chained._snapshot()
    assert strip(shape(a["root"])) == strip(shape(b["root"]))


def test_a_detached_chain_is_sent_with_the_scene_that_draws_it():
    sales = hm.Data(SALES)
    focus = hm.selection()
    by_region = sales.group_by("region").agg(revenue=hm.col.revenue.sum())
    by_product = sales.filter(focus, inactive="all").group_by("product").agg(revenue=hm.sum("revenue"))
    with hm.Row() as chart:
        with hm.Plot():
            bars = hm.charts.Bar(data=by_region, x="region", y="revenue", select=focus)
        with hm.Plot():
            hm.charts.Bar(data=by_product, x="product", y="revenue")
        with hm.Plot():
            # hm.Data is its table: a brush here is the one sales.filter("@brushed") reads.
            points = hm.Points(data=sales, x="revenue", y="revenue", brush=True)
    state, _ = chart._scene()._snapshot()
    roots = [c for c in state["root"]["children"] if c["kind"] == "Data"]
    assert len(roots) == 1 and roots[0]["id"] == sales.id
    assert [c["kind"] for c in roots[0]["children"]] == ["Group", "Filter"]
    assert points.selection is sales.props["value"].selection
    assert bars is not None
    # The chain is not moved: another scene can draw it too.
    assert sales.parent is None
    with hm.Plot() as other:
        hm.charts.Bar(data=by_region, x="region", y="revenue")
    other_state, _ = other._scene()._snapshot()
    assert other_state["root"]["children"][0]["id"] == sales.id


def test_a_chain_reads_inputs_and_joins_live_output():
    flights = hm.Data({"route": ["a", "a", "b"], "delay": [10.0, 20.0, 5.0]})
    routes = hm.Data({"route": ["a", "b", "c"], "x": [0, 1, 2]})
    stats = flights.filter("@brushed", hm.col.delay <= hm.input.limit).group_by("route").agg(
        hm.count().alias("flights"), delay=hm.col.delay.mean())
    joined = routes.join(stats, on="route", fields=["flights"])
    with hm.Scene() as scene:
        hm.Slider(name="limit", min=0, max=30, value=30)
        with hm.Plot():
            hm.Points(data=joined, x="x", y="flights")
    state, _ = scene._snapshot()
    join = next(c for root in state["root"]["children"] if root["kind"] == "Data"
                for c in root["children"] if c["kind"] == "Join")
    assert join["props"]["data"] == {"$ref": stats.id} and join["props"]["how"] == "left"
    where = stats.parent.props["where"]
    assert isinstance(where, list) and where[0] == "@brushed"
    assert set(stats.props["columns"]) == {"flights", "delay"}


@pytest.mark.parametrize("kind", ["Plot", "Facet"])
@pytest.mark.parametrize("update", [False, True], ids=["construct", "update"])
def test_containers_use_live_pipeline_data_for_their_children(kind, update):
    sales = hm.Data(SALES)
    totals = sales.group_by("region").agg(revenue=hm.col.revenue.sum())
    with hm.Scene() as scene:
        container = getattr(hm, kind)(**({"column": "region"} if kind == "Facet" else {}),
                                     data=SALES if update else totals)
        with container:
            points = hm.Points(x="region", y="revenue")
    if update:
        container.update(data=totals)
    state, _ = scene._snapshot()
    assert state["root"]["children"][0]["id"] == sales.id
    assert state["root"]["children"][1]["props"]["data"] == {"$ref": totals.id}
    assert points.selection is container.selection is sales.selection
    assert sales.parent is None
    revision = scene.revision
    totals.update(columns={"revenue": hm.col.revenue.mean()})
    assert scene.revision == revision + 1
    from hmplot.exporter import _html_parts
    _html_parts(scene)


def test_group_by_sort_and_totals():
    sales = hm.Data(SALES)
    totals = sales.group_by().agg(total=hm.sum("revenue"))
    assert "by" not in totals.props
    counts = sales.group_by("region", "product").len()
    assert counts.props["by"] == ["region", "product"] and "len" in counts.props["columns"]
    ranked = counts.sort("len", descending=True)
    assert ranked.props == {**ranked.props, "by": "len", "order": "desc"}
    assert ranked.collect() is ranked


def test_pandas_names_say_which_method_to_use():
    sales = hm.Data(SALES)
    with pytest.raises(AttributeError, match=r"group_by"):
        sales.groupby("region")
    with pytest.raises(AttributeError, match=r"with_columns"):
        sales.assign(x=1)
    with pytest.raises(AttributeError, match=r"join"):
        sales.merge(sales)
    with pytest.raises(AttributeError, match=r"filter"):
        sales.query("revenue > 1")
    with pytest.raises(AttributeError, match=r"computed live in the browser"):
        sales.filter(hm.col.revenue > 1).to_pandas()
    with pytest.raises(AttributeError, match=r"name the outputs in agg"):
        sales.group_by("region").sum()
    with pytest.raises(TypeError, match=r"name each output"):
        sales.with_columns(hm.col.revenue * 2)
    with pytest.raises(ValueError, match=r'"left" or "inner"'):
        sales.join(sales, on="region", how="outer")
    with pytest.raises(TypeError, match=r"needs a predicate"):
        sales.filter()


def test_a_transform_outside_a_chain_is_still_an_error():
    stray = hm.Filter(where=hm.col.x > 1)
    with pytest.raises(ValueError, match="not in this scene"):
        with hm.Scene() as scene:
            with hm.Plot():
                hm.Points(data=stray, x="x", y="x")
        scene._snapshot()


def test_closing_one_scene_leaves_a_shared_pipeline_usable():
    sales = hm.Data(SALES)
    filtered = sales.filter(hm.col.revenue > 0)
    filtered.on_event("click", lambda event: None)
    with hm.Scene() as first:
        with hm.Plot():
            hm.Points(data=filtered, x="revenue", y="revenue")
    with hm.Scene() as second:
        with hm.Plot():
            hm.Points(data=filtered, x="revenue", y="revenue")
    revision = second.revision
    first.close()
    filtered.update(where=hm.col.revenue > 1)
    assert second.revision == revision + 1
    assert first not in sales._adopters and second in sales._adopters
    assert filtered._callbacks["click"]
    second.close()
    filtered.update(where=hm.col.revenue > 2)


def test_removing_the_last_consumer_unsubscribes_its_scene():
    sales = hm.Data(SALES)
    filtered = sales.filter(hm.col.revenue > 0)
    with hm.Scene() as scene:
        with hm.Plot() as plot:
            points = hm.Points(data=filtered, x="revenue", y="revenue")
    plot.remove(points)
    revision = scene.revision
    filtered.update(where=hm.col.revenue > 1)
    assert scene.revision == revision
    assert scene not in sales._adopters
    assert not scene._adopted


def test_rejected_reference_update_preserves_pipeline_subscriptions():
    sales = hm.Data(SALES)
    filtered = sales.filter(hm.col.revenue > 0)
    other = hm.Data(SALES).filter(hm.col.revenue > 1)
    with hm.Scene() as scene:
        with hm.Plot():
            points = hm.Points(data=filtered, x="revenue", y="revenue")
    with pytest.raises(ValueError, match="use position or x/y/z"):
        points.update(data=other, position=[[0, 0]])
    revision = scene.revision
    other.update(where=hm.col.revenue > 2)
    assert scene.revision == revision
    filtered.update(where=hm.col.revenue > 2)
    assert scene.revision == revision + 1
    assert scene in sales._adopters
    assert scene not in getattr(other.parent, "_adopters", ())


FLUENT_ROOT = __import__("pathlib").Path(__file__).resolve().parents[2] / "src/recipes/fluent"
FLUENT_REFERENCE = sorted([*FLUENT_ROOT.glob("*.py"), *FLUENT_ROOT.glob("reference/*.py")])


@pytest.mark.parametrize("path", FLUENT_REFERENCE, ids=lambda path: path.stem)
def test_fluent_reference_examples_build(path):
    # The fluent doc set's reference examples (fluentDocs.js CHAINED) leave one display handle and
    # validate, as the standard ones do (test_api_consistency.py).
    namespace = {"__name__": "__main__"}
    exec(compile(path.read_text(), str(path), "exec"), namespace)
    roots = [v for v in namespace.values() if isinstance(v, hm.Node) and v.parent is None
             and not getattr(v, "_chain_root", False)]
    assert len(roots) == 1
    scene = roots[0]._scene()
    scene._validate()
    scene._snapshot()
    # The advertised display handle must also export with every live pipeline it reads.
    from hmplot.exporter import _html_parts
    _html_parts(roots[0])


@pytest.mark.asyncio
async def test_read_asks_the_displayed_scene_for_a_nodes_rows_and_decodes_them():
    # TODO 145.1: `await node.read()` sends a "read" command to the node in a displayed scene
    # (a chain adopted by the scene too) and returns its columns as NumPy arrays.
    import numpy as np
    sales = hm.Data(SALES)
    totals = sales.filter("@brushed").group_by("region").agg(total=hm.sum("revenue"))
    with hm.Scene() as scene:
        with hm.Plot(data=sales):
            hm.Points(x="revenue", y="revenue", brush=True)
        with hm.Plot():
            hm.Points(data=totals, x="region", y="total")
    scene._snapshot()
    scene._views["v"] = {"ready": True, "revision": scene.revision}
    reply = {"length": 2, "columns": {"region": ["east", "west"], "total": [12.5, None],
                                      "when": [{"$datetime": 86400000}, None]}}

    class Transport:
        def __init__(self):
            self.messages = []

        def send(self, message):
            self.messages.append(message)
            if message.get("type") == "command" and message.get("command") == "read":
                scene._receive({"type": "result", "scene": scene.id, "request": message["request"], "value": reply}, [])

    scene._widget = Transport()
    table = await totals.read(["region", "total", "when"], timeout=1)
    sent = [m for m in scene._widget.messages if m.get("command") == "read"][-1]
    assert sent["target"] == totals.id and sent["view"] == "v"
    assert sent["args"]["columns"] == ["region", "total", "when"] and sent["args"]["maxBytes"] > 0
    assert list(table) == ["region", "total", "when"]
    assert table["region"].tolist() == ["east", "west"]
    assert table["total"][0] == 12.5 and np.isnan(table["total"][1])
    assert table["when"].dtype == np.dtype("datetime64[ms]") and str(table["when"][0]) == "1970-01-02T00:00:00.000"
    assert np.isnat(table["when"][1])
