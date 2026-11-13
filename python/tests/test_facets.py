"""Facet fields and pairs (TODO 21 Part F): construction, the structural rules (the texts of
src/lib/plot/utils/facetSpec.js, through registry.json), the deprecated hm.Pairs, and the
snapshot the browser partitions."""
import re
import warnings

import pytest
import hmplot as hm
from hmplot.core import REGISTRY

ERRORS = REGISTRY["facet"]["errors"]


def message(name, **values):
    text = re.sub(r"\{(\w+)\}", lambda m: str(values.get(m.group(1), m.group(0))), ERRORS[name])
    return "^" + re.escape(text) + "$"


def facet_props(scene):
    state, _ = scene._snapshot()
    nodes = [state["root"]]
    while nodes:
        node = nodes.pop()
        if node["kind"] == "Facet":
            return node["props"]
        nodes.extend(node.get("children", []))
    raise AssertionError("no Facet in the snapshot")


def test_every_form_constructs_and_snapshots_unchanged():
    data = {"id": [1, 2], "g": ["p", "q"], "a": [1.0, 2.0], "b": [3.0, 4.0], "c": [5.0, 6.0]}
    forms = [
        dict(fields=["a", "b"]),
        dict(fields=("a", "b"), row="g"),
        dict(fields={"row": ["a", "b"]}, column="g"),
        dict(fields={"column": ["a", "b"]}, wrap=2, column_order=["b", "a", "z"]),
        dict(fields=["a", "b"], as_={"value": "v", "field": "name"}),
        dict(pairs=["a", "b", "c"], triangle="lower", diagonal=False),
        dict(pairs={"x": ["a", "b"], "y": ["c"]}, diagonal=True),
        dict(pairs=["a", "b"], as_={"x": "px"}, row_order=["b", "a"]),
    ]
    for form in forms:
        with hm.Scene() as scene:
            with hm.Plot(data=data):
                with hm.Facet(**form):
                    hm.Points(x="id", y="value")
        props = facet_props(scene)
        if "as_" in form:
            assert props["as"] == form["as_"] and "as_" not in props
        for key in ("fields", "pairs", "triangle", "diagonal"):
            if key in form:
                expected = list(form[key]) if isinstance(form[key], tuple) else form[key]
                assert props[key] == expected, (key, form)


@pytest.mark.parametrize("props, name, values", [
    (dict(fields=["a"], column="island"), "fieldsDimension", dict(dimension="column", other="row", field="island")),
    (dict(fields={"row": ["a"]}, row="g"), "fieldsDimension", dict(dimension="row", other="column", field="g")),
    (dict(fields=[]), "fields", {}),
    (dict(fields=["a", "a"]), "fields", {}),
    (dict(fields="a"), "fields", {}),
    (dict(fields={"row": ["a"], "column": ["b"]}), "fields", {}),
    (dict(fields=["a"], row="g", wrap=2), "wrap", {}),
    (dict(fields=["a", "b"], column_order=["a", "a"]), "order", {}),
    (dict(pairs=["a"], row="g"), "pairsCombine", {}),
    (dict(pairs=["a"], fields=["b"]), "pairsCombine", {}),
    (dict(pairs=[]), "pairs", {}),
    (dict(pairs={"x": ["a"]}), "pairs", {}),
    (dict(pairs={"x": ["a"], "y": ["b"]}, triangle="lower"), "triangleXY", {}),
    (dict(pairs=["a"], triangle="left"), "triangle", {}),
    (dict(pairs=["a"], diagonal="no"), "diagonal", {}),
    (dict(pairs=["a"], wrap=2), "wrap", {}),
    (dict(column="g", triangle="lower"), "pairsOnly", {}),
    (dict(column="g", diagonal=False), "pairsOnly", {}),
    (dict(column="g", as_={"value": "v"}), "as", {}),
    (dict(fields=["a"], as_={"x": "v"}), "as", {}),
    (dict(fields=["a"], as_={"value": "@v"}), "asNames", {}),
    (dict(fields=["a"], as_={"value": "field"}), "asNames", {}),
])
def test_structural_rules_raise_the_shared_messages(props, name, values):
    with pytest.raises(ValueError, match=message(name, **values)):
        hm.Facet(**props)


def test_update_checks_the_merged_props_and_keeps_the_old_ones_on_error():
    facet = hm.Facet(fields=["a", "b"])
    with pytest.raises(ValueError, match=message("fieldsDimension", dimension="column", other="row", field="g")):
        facet.update(column="g")
    assert facet.props == {"fields": ["a", "b"]}
    facet.update(row="g")
    assert facet.props == {"fields": ["a", "b"], "row": "g"}
    with pytest.raises(ValueError, match=message("pairsCombine")):
        facet.update(pairs=["a"])
    facet.update(fields=None, row=None, pairs=["a", "b"], triangle="upper")
    assert facet.props["triangle"] == "upper"


def test_registry_lists_the_triangles():
    assert REGISTRY["facet"]["triangles"] == ["full", "upper", "lower"]
    assert set(ERRORS) >= {"fields", "fieldsDimension", "pairs", "pairsCombine", "triangle", "triangleXY",
                           "diagonal", "pairsOnly", "as", "asNames", "wrap", "order"}


def test_a_facet_around_marks_makes_its_cell_plot(monkeypatch):
    # TODO 129.2: Facet(marks) is sent as Facet(Plot(marks)), alone, in a Row, with a transform
    # between, as if the Plot were written; the Python tree keeps the user's shape.
    data = {"g": ["a", "a", "b", "b"], "x": [1.0, 2.0, 3.0, 4.0]}

    def shape(node):
        return [node["kind"], node["props"] if node["kind"] == "Plot" else None,
                [shape(child) for child in node["children"]]]

    with hm.Facet(data=data, column="g") as facet:
        histogram = hm.charts.Histogram(x="x")
    facet._scene()._validate()
    root = facet._scene()._snapshot()[0]["root"]
    assert shape(root["children"][0]) == ["Facet", None, [["Plot", {"height": 450, "autoBounds": True}, [["Histogram", None, []]]]]]
    assert facet.children == [histogram] and histogram.parent is facet
    with hm.Scene() as scene:
        with hm.Row():
            with hm.Facet(data=data, column="g"):
                with hm.stats.Bin(x="x"):
                    hm.Rect(x0="x0", x1="x1", y0=0, y1="count")
    scene._validate()
    row = scene._snapshot()[0]["root"]["children"][0]
    assert shape(row["children"][0])[2][0][:2] == ["Plot", {"height": 450, "autoBounds": True}]
    # A Facet holding a Plot and bare marks is an error naming the marks; an embedded Facet
    # (inside a Plot) and a written cell Plot are unchanged.
    with pytest.raises(ValueError, match="Facet holds both a Plot and Points outside it"):
        with hm.Scene():
            with hm.Facet(data=data, column="g"):
                hm.Points(x="x", y="x")
                with hm.Plot():
                    hm.Points(x="x", y="x")
    with hm.Plot(data=data) as plot:
        with hm.Facet(column="g"):
            hm.Points(x="x", y="x")
    assert shape(plot._scene()._snapshot()[0]["root"]["children"][0])[2][0][0] == "Facet"
    with hm.Facet(data=data, column="g") as written:
        with hm.Plot():
            hm.Points(x="x", y="x")
    assert [child["kind"] for child in written._scene()._snapshot()[0]["root"]["children"][0]["children"]] == ["Plot"]
    # Inputs never go inside the cell Plot.
    with pytest.raises(ValueError, match="is inside a Plot"):
        with hm.Scene():
            with hm.Facet(data=data, column="g"):
                hm.Points(x="x", y="x")
                hm.Slider(name="size", min=1, max=5)
    # visualize_tree shows the cell Plot as implicit.
    seen, original = [], hm.Data
    monkeypatch.setattr(hm, "Data", lambda rows, **options: seen.append(rows) or original(rows, **options))
    hm.visualize_tree(facet)
    names = dict(zip(seen[-1]["node_id"], seen[-1]["name"]))
    assert [(name, names.get(parent, parent)) for name, parent in zip(seen[-1]["name"], seen[-1]["parent_id"])] == \
        [("Facet", "(top)"), ("Plot (implicit)", "Facet"), ("Histogram", "Plot (implicit)")]
