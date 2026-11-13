"""Stage 15 connections: the Anchor mark, hm.connect, mark.endpoint, Facet/Partition endpoint
selections, the `connections` property, and the $connect snapshot descriptor."""
import copy
import inspect
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import hmplot as hm
from hmplot.core import REGISTRY


def test_anchor_is_a_mark():
    # Positions and animation only: the signature has no appearance keywords.
    signature = inspect.signature(hm.Anchor)
    params = set(signature.parameters)
    assert {"x", "y", "z", "position", "name", "identity", "data", "enter_effect", "exit_effect",
            "animation", "animation_duration", "animation_easing"} <= params
    assert not {"fill", "size", "color", "opacity", "outline_color", "shape", "select", "hover"} & params
    signatures = json.loads((Path(hm.__file__).parent / "signatures.json").read_text())
    assert set(signatures["Anchor"]) == params - {"children", "props"}
    assert REGISTRY["components"]["Anchor"]["container"] is False
    assert REGISTRY["components"]["Anchor"]["module"] == "./plot/bound/anchor.svelte"

    # It builds inside a Plot from a data scope and animates its channels like a mark.
    with hm.Scene() as scene:
        with hm.Plot(data={"value": [1.0, 2.0, 3.0], "id": [1, 2, 3]}):
            anchor = hm.Anchor(x=0, y=hm.animate("value", duration=400), name="values")
    state, _ = scene._snapshot()
    nodes = [state["root"]]
    found = []
    while nodes:
        node = nodes.pop()
        if node["kind"] == "Anchor":
            found.append(node)
        nodes.extend(node.get("children", []))
    assert len(found) == 1
    assert found[0]["id"] == anchor.id
    assert found[0]["props"]["name"] == "values"
    assert found[0]["props"]["x"] == 0
    assert "$animate" in json.dumps(found[0]["props"]["y"])


def test_anchor_takes_local_data_and_must_be_inside_a_plot():
    with hm.Scene() as scene:
        with hm.Plot():
            hm.Anchor(data={"a": [1.0, 2.0], "b": [3.0, 4.0]}, x="a", y="b")
    scene._snapshot()
    with pytest.raises(ValueError, match="Anchor must be inside a Plot"):
        with hm.Scene() as detached:
            hm.Anchor(x=[1.0], y=[2.0])
        detached._snapshot()


def test_anchor_rejects_unknown_keywords():
    with pytest.raises(TypeError, match=r"Anchor: unknown property 'sizes'"):
        hm.Anchor(x=[1.0], y=[2.0], sizes=4)



# ---------------------------------------------------------------------------------------
# hm.connect / endpoint(): construction
# ---------------------------------------------------------------------------------------
from hmplot import connections as C

PAIRS = {"id": [1, 2, 3], "x0": [10.0, 15.0, 20.0], "x1": [80.0, 85.0, 90.0], "y": [20.0, 50.0, 80.0]}


def _find(node, predicate):
    found = [node] if predicate(node) else []
    for child in node.get("children", []):
        found.extend(_find(child, predicate))
    return found


def test_connect_builds_an_immutable_versioned_descriptor():
    with hm.Scene():
        with hm.Plot(data=PAIRS):
            before = hm.Points(x="x0", y="y", name="before")
            after = hm.Anchor(x="x1", y="y", name="after")
            middle = hm.Text(x="x0", y="y", text="id")
    connection = hm.connect(before, middle, after.endpoint(), key="id")
    assert isinstance(connection, hm.Connect)
    assert connection.version == 1 == C.CONNECT_VERSION
    assert (connection.key, connection.order) == ("id", None)
    assert [e.node for e in connection.endpoints] == [before, middle, after]
    assert all(isinstance(e, hm.Endpoint) and e.at is None and e.scope is None for e in connection.endpoints)
    assert "key='id'" in repr(connection)
    with pytest.raises(AttributeError, match="immutable"):
        connection.key = "other"
    with pytest.raises(AttributeError, match="immutable"):
        connection.endpoints[0].at = "center"
    with pytest.raises(TypeError, match="cannot be tested"):
        bool(connection)
    # A copy is the same descriptor (the endpoints still reference the scene's nodes).
    clone = copy.copy(connection)
    assert clone.endpoints == connection.endpoints and clone.key == "id"
    assert hm.connect(before, after).key is None
    signature = inspect.signature(hm.connect)
    assert list(signature.parameters) == ["endpoints", "key", "order"]
    assert {"connect", "Connect", "Endpoint"} <= set(hm.__all__)


def test_mark_endpoints_choose_attachments():
    with hm.Scene():
        with hm.Plot(data=PAIRS):
            rect = hm.Rect(x0="x0", x1="x1", y0="y", y1="y")
            points = hm.Points(x="x0", y="y")
            segments = hm.Segments(start=[[0, 0]], end=[[1, 1]])
            bar = hm.charts.Bar(x="x0", y="y")
            box = hm.charts.BoxPlot(x="x0", y="y")
    assert rect.endpoint(at="left").at == "left"
    assert rect.endpoint().at is None
    assert bar.endpoint(at="value").at == "value"
    assert box.endpoint(at="median").at == "median"
    assert segments.endpoint(at="start").node is segments
    with pytest.raises(ValueError, match=re.escape(
            'Points.endpoint: Points does not offer at="left"; available: center.')):
        points.endpoint(at="left")
    with pytest.raises(ValueError, match=re.escape(
            'Rect.endpoint: Rect does not offer at="value"; available: center, left, right, bottom, top.')):
        rect.endpoint(at="value")
    with pytest.raises(TypeError, match=re.escape(
            'endpoint: at must name an attachment such as "center", "left", or "start", not 5.')):
        rect.endpoint(at=5)
    # Segments have no default attachment: passing the mark itself names the choices.
    with pytest.raises(ValueError, match=re.escape(
            "connect: Segments has no default endpoint; choose one with endpoint(at=...) from: start, end.")):
        hm.connect(points, segments)
    hm.connect(points, segments.endpoint(at="end"))
    with pytest.raises(TypeError, match=re.escape("Rect.endpoint: a mark is its own endpoint and takes no name")):
        rect.endpoint("values")


def test_marks_that_cannot_be_endpoints_say_so():
    with hm.Scene():
        with hm.Plot(data=PAIRS) as plot:
            line = hm.Line(x="x0", y="y")
            points = hm.Points(x="x0", y="y")
            area = hm.Area(x="x0", upper="y")
    with pytest.raises(TypeError, match=re.escape(
            "Line.endpoint: Line endpoints are not supported yet (general line vertices); use Anchor at the position you need.")):
        line.endpoint()
    with pytest.raises(TypeError, match=re.escape(
            "connect: Area endpoints are not supported yet (boundary intersections); use Anchor at the position you need.")):
        hm.connect(points, area)
    with pytest.raises(TypeError, match=re.escape("Plot.endpoint: Plot is not a mark")):
        plot.endpoint()


def test_facet_and_partition_select_their_repeated_endpoint_by_name():
    with hm.Scene():
        with hm.Plot(data={"id": [1, 2], "g": ["a", "b"], "a": [1.0, 2.0], "b": [3.0, 4.0]}):
            with hm.Fold(fields=["a", "b"]):
                with hm.Facet(column="key", scales="free-y", layout="grid") as facet:
                    anchor = hm.Anchor(x=0, y="value", name="values")
            with hm.Partition(by="g") as partition:
                hm.Anchor(x="a", y="b", name="tip")
    selection = facet.endpoint("values")
    assert (selection.scope, selection.name, selection.node, selection.at) == (facet, "values", None, None)
    assert "endpoint('values')" in repr(selection)
    assert partition.endpoint("tip", at="center").at == "center"
    with pytest.raises(TypeError, match=re.escape(
            'Facet.endpoint: pass the name of the repeated endpoint mark, e.g. facet.endpoint("values").')):
        facet.endpoint()
    with pytest.raises(TypeError, match=re.escape(
            'Partition.endpoint: pass the name of the repeated endpoint mark, e.g. partition.endpoint("values").')):
        partition.endpoint("")
    # One repeated endpoint connects its cells in facet order (the default; order="facet" says
    # so explicitly); a direct reference to the repeated mark selects the same definition.
    by_name = hm.connect(selection, key="id")
    by_reference = hm.connect(anchor, key="id")
    assert by_name.order is by_reference.order is None
    assert by_name.endpoints[0].scope is facet and by_reference.endpoints[0].node is anchor
    assert hm.connect(anchor, key="id", order="facet").order == "facet"
    assert hm.connect(partition.endpoint("tip")).order is None
    with pytest.raises(TypeError, match=re.escape(
            'connect: argument 1 is a Facet or Partition; select the repeated mark with .endpoint("name").')):
        hm.connect(facet, key="id", order="facet")


def test_an_external_facet_offers_no_endpoints():
    with hm.Scene():
        with hm.Facet(data={"k": ["a", "b"], "v": [1.0, 2.0]}, column="k") as facet:
            with hm.Plot():
                hm.Anchor(x=0, y="v", name="values")
    with pytest.raises(ValueError, match=re.escape(C.EXTERNAL_FACET_ENDPOINT_ERROR)):
        facet.endpoint("values")


def test_connect_argument_errors_mirror_the_renderer():
    with hm.Scene():
        with hm.Plot(data=PAIRS):
            a = hm.Anchor(x="x0", y="y")
            b = hm.Anchor(x="x1", y="y")
    with pytest.raises(TypeError, match=re.escape(
            'connect: pass the endpoints to connect: marks, mark.endpoint(at=...), or facet.endpoint("name").')):
        hm.connect(key="id")
    # One mark that no Facet or Partition repeats has nothing to connect to, order or not.
    for order in (None, "facet"):
        with pytest.raises(ValueError, match=re.escape(
                f'connect: "Anchor {a.id}" is a single mark, so it has nothing to connect to; pass two or more '
                "endpoints, or one mark repeated by a Facet or Partition.")):
            hm.connect(a, order=order)
    with pytest.raises(ValueError, match=re.escape('connect: order="facet" takes one repeated endpoint definition.')):
        hm.connect(a, b, order="facet")
    with pytest.raises(TypeError, match=re.escape("connect: key must name one column (a non-empty string), not 5.")):
        hm.connect(a, b, key=5)
    with pytest.raises(TypeError, match=re.escape('connect: key must name one column (a non-empty string), not ["id"].')):
        hm.connect(a, b, key=["id"])
    with pytest.raises(TypeError, match=re.escape('not "".')):
        hm.connect(a, b, key="")
    with pytest.raises(ValueError, match=re.escape('connect: order must be "facet" or omitted, not "rows".')):
        hm.connect(a, b, order="rows")
    for index, value in ((1, "x0"), (0, None), (0, [a, b])):
        args = (a, value) if index else (value, b)
        with pytest.raises(TypeError, match=re.escape(
                f"connect: argument {index + 1} is not an endpoint; pass a mark, mark.endpoint(at=...), "
                'or facet.endpoint("name").')):
            hm.connect(*args)
    with pytest.raises(TypeError, match="unexpected keyword argument 'by'"):
        hm.connect(a, b, by="id")


# ---------------------------------------------------------------------------------------
# The connections property
# ---------------------------------------------------------------------------------------
def test_connections_belong_to_the_four_connector_marks():
    with hm.Scene():
        with hm.Plot(data=PAIRS):
            a = hm.Anchor(x="x0", y="y")
            b = hm.Anchor(x="x1", y="y")
            connection = hm.connect(a, b, key="id")
            for kind in ("Line", "Segments", "Arrows3D", "Arrows"):
                getattr(hm.charts if kind in hm.charts.__all__ else hm, kind)(connections=connection)
            for kind in ("Points", "Area", "Mapping", "Anchor"):
                with pytest.raises(TypeError, match=re.escape(
                        f"{kind}.connections: only Line, Segments, Arrows3D, and Arrows accept connections.")):
                    getattr(hm.charts if kind in hm.charts.__all__ else hm, kind)(connections=connection)


def test_connections_exclude_positions_and_series():
    with hm.Scene():
        with hm.Plot(data=PAIRS):
            a = hm.Anchor(x="x0", y="y")
            b = hm.Anchor(x="x1", y="y")
            connection = hm.connect(a, b, key="id")
            # A Line's positions are x, y, z or position; Segments' are start and end.
            for kind, channel in (("Line", "x"), ("Line", "y"), ("Line", "z"), ("Line", "position"),
                                  ("Segments", "start"), ("Segments", "end")):
                with pytest.raises(ValueError, match=re.escape(
                        f"{kind}: connections cannot be combined with x, y, z, position, start, or end.")):
                    getattr(hm, kind)(connections=connection, **{channel: "x0"})
            with pytest.raises(ValueError, match=re.escape(
                    "Line: connections cannot be combined with series; each connection is already its own path.")):
                hm.Line(connections=connection, series="id")
            line = hm.Line(connections=connection, color="#00c800")
    # update() is checked the same way and rolls back.
    with pytest.raises(ValueError, match="connections cannot be combined with x"):
        line.update(x="x0")
    assert "x" not in line.props and isinstance(line.props["connections"], hm.Connect)
    # Leaving connections for positions is one update.
    line.update(connections=None, x="x0", y="y")
    assert line.props["connections"] is None and line.props["x"] == "x0"


def test_connect_is_the_whole_value_of_connections():
    with hm.Scene():
        with hm.Plot(data=PAIRS):
            a = hm.Anchor(x="x0", y="y")
            b = hm.Anchor(x="x1", y="y")
    connection = hm.connect(a, b, key="id")
    nested = re.escape("hm.connect(...) is the whole value of a Line, Segments, Arrows3D, or Arrows "
                       "connections property, not nested inside a list, dict, literal, or expression.")
    with pytest.raises(TypeError, match=r"Line\.connections: " + nested):
        hm.Line(connections=[connection])
    with pytest.raises(TypeError, match=r"Line\.connections: " + nested):
        hm.Line(connections={"a": connection})
    with pytest.raises(TypeError, match=r"Line\.color: " + nested):
        hm.Line(color=[connection])
    with pytest.raises(TypeError, match=r"Line\.color: " + nested):
        hm.Line(color=hm.literal(connection))
    with pytest.raises(TypeError, match=re.escape("cannot be an argument of add")):
        hm.col.x + connection
    with pytest.raises(TypeError, match=re.escape(
            'Line.connections: pass a connect() descriptor, e.g. connections=hm.connect(before, after, key="id").')):
        hm.Line(connections="id")
    with pytest.raises(TypeError, match=re.escape('Line.connections: pass a connect() descriptor')):
        hm.Line(connections=a.endpoint())
    with pytest.raises(TypeError, match=re.escape("Line.color: an endpoint belongs inside hm.connect(...)")):
        hm.Line(color=a.endpoint())


# ---------------------------------------------------------------------------------------
# Scene validation, snapshots, updates, events, export
# ---------------------------------------------------------------------------------------
def test_snapshot_carries_a_versioned_connect_with_endpoint_refs():
    # The connector comes before its endpoints (a forward reference): the snapshot keeps the
    # authored order and the renderer resolves the $refs once the endpoints mount.
    before = hm.Anchor(x="x0", y="y", name="before")
    after = hm.Anchor(x="x1", y="y", name="after")
    rect = hm.Rect(x0="x0", x1="x1", y0="y", y1="y")
    with hm.Scene() as scene:
        with hm.Plot(data=PAIRS) as plot:
            arrows = hm.Arrows3D(connections=hm.connect(before, after, key="id"), color="#00c800")
            segments = hm.Segments(connections=hm.connect(rect.endpoint(at="left"), after))
            plot.add(before, after, rect)
    state, _ = scene._snapshot()
    json.dumps(state, allow_nan=False)
    plot_node = _find(state["root"], lambda n: n["id"] == plot.id)[0]
    assert [child["id"] for child in plot_node["children"]] == [arrows.id, segments.id, before.id, after.id, rect.id]
    arrows_node = _find(state["root"], lambda n: n["id"] == arrows.id)[0]
    assert arrows_node["props"]["connections"] == {"$connect": {
        "version": 1, "key": "id", "order": None,
        "endpoints": [{"target": {"$ref": before.id}, "at": None}, {"target": {"$ref": after.id}, "at": None}],
    }}
    segments_node = _find(state["root"], lambda n: n["id"] == segments.id)[0]
    assert segments_node["props"]["connections"]["$connect"]["endpoints"][0] == {"target": {"$ref": rect.id}, "at": "left"}
    # Every $ref names a node of the snapshot.
    ids = {n["id"] for n in _find(state["root"], lambda n: True)}
    refs = re.findall(r'"\$ref": "([^"]+)"', json.dumps(state))
    assert refs and set(refs) <= ids


def test_snapshot_encodes_facet_selections_and_marks_with_local_data():
    facet = hm.Facet(column="key", scales="free-y", layout="grid")
    with hm.Scene() as scene:
        with hm.Plot(data={"id": [1, 2], "a": [1.0, 2.0], "b": [3.0, 4.0]}):
            with hm.Fold(fields=["a", "b"]) as fold:
                line = hm.Line(connections=hm.connect(facet.endpoint("values"), key="id", order="facet"))
                fold.add(facet)
                with facet:
                    hm.Anchor(x=0, y="value", name="values")
            # A mark with its own data= is wrapped in a Data node; its $ref is still its own id.
            local = hm.Points(data={"id": [1], "x": [0.0], "y": [0.0]}, x="x", y="y")
            other = hm.Anchor(data={"id": [1], "x": [1.0], "y": [1.0]}, x="x", y="y")
            hm.Segments(connections=hm.connect(local, other, key="id"))
    state, _ = scene._snapshot()
    line_node = _find(state["root"], lambda n: n["id"] == line.id)[0]
    assert line_node["props"]["connections"] == {"$connect": {
        "version": 1, "key": "id", "order": "facet",
        "endpoints": [{"scope": {"$ref": facet.id}, "name": "values", "at": None}],
    }}
    wrapped = _find(state["root"], lambda n: n["id"] == local.id)[0]
    assert wrapped["kind"] == "Points"
    assert _find(state["root"], lambda n: n["kind"] == "Data" and n["children"][0]["id"] == local.id)


def test_scene_validation_checks_where_endpoints_live():
    with pytest.raises(ValueError, match=re.escape(
            'Line.connections: endpoint "here" belongs to another Plot; connections stay within one Plot.')):
        with hm.Scene():
            with hm.Plot(data=PAIRS):
                here = hm.Anchor(x="x0", y="y", name="here")
            with hm.Plot(data=PAIRS):
                there = hm.Anchor(x="x1", y="y", name="there")
                hm.Line(connections=hm.connect(here, there, key="id"))
    # An endpoint that never joined the scene.
    stray = hm.Anchor(x=[0.0], y=[0.0])
    with pytest.raises(ValueError, match=re.escape("is not part of this scene; add it to the Plot before displaying.")):
        with hm.Scene():
            with hm.Plot(data=PAIRS):
                anchor = hm.Anchor(x="x0", y="y")
                hm.Segments(connections=hm.connect(anchor, stray, key="id"))
    # A Facet selected before it was placed, then placed as an external grid.
    facet = hm.Facet(column="k")
    with pytest.raises(ValueError, match=re.escape(C.EXTERNAL_FACET_ENDPOINT_ERROR)):
        with hm.Scene():
            with hm.Plot(data={"k": ["a"], "v": [1.0]}):
                hm.Line(connections=hm.connect(facet.endpoint("values"), key="k"))
            with hm.Row() as row:
                row.add(facet)
    # A single mark placed after it was connected is checked when the scene validates.
    single = hm.Anchor(x="x0", y="y", name="single")
    assert hm.connect(single).endpoints[0].node is single
    with pytest.raises(ValueError, match=re.escape(C.single_endpoint_error("single"))):
        with hm.Scene():
            with hm.Plot(data=PAIRS) as plot:
                hm.Line(connections=hm.connect(single, key="id"))
                plot.add(single)


def test_updates_republish_the_connection():
    table = hm.Table(PAIRS)
    with hm.Scene() as scene:
        with hm.Plot(data=table):
            before = hm.Anchor(x="x0", y="y")
            after = hm.Anchor(x="x1", y="y")
            line = hm.Line(connections=hm.connect(before, after, key="id"))
    revision = scene.revision
    line.update(connections=hm.connect(after, before, key="id"))
    assert scene.revision == revision + 1
    assert scene._property_revisions[(line.id, "connections")] == scene.revision
    endpoints = scene._last_state and _find(scene._last_state["root"], lambda n: n["id"] == line.id)[0]["props"]["connections"]["$connect"]["endpoints"]
    assert [e["target"]["$ref"] for e in endpoints] == [after.id, before.id]
    # A data update republishes the table; the descriptor is unchanged.
    table.update_columns(y=[1.0, 2.0, 3.0])
    assert scene._property_revisions[(line.id, "connections")] == revision + 1


def test_connector_events_carry_the_connection():
    with hm.Scene() as scene:
        with hm.Plot(data=PAIRS):
            before = hm.Anchor(x="x0", y="y", name="before")
            after = hm.Anchor(x="x1", y="y", name="after")
            arrows = hm.Arrows3D(connections=hm.connect(before, after, key="id"))
    events = []
    arrows.on_click(events.append)
    scene._views["v"] = {"ready": True}
    slot = lambda index, label, node: {"slot": index, "label": label, "definition": f"plot/{label}", "cell": None,
                                       "kind": "Anchor", "row": 1, "key": "number:2", "node": node}
    connection = {"index": 1, "key": 2, "source": slot(0, "before", before.id), "target": slot(1, "after", after.id),
                  "slots": [slot(0, "before", before.id), slot(1, "after", after.id)]}
    scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision, "target": arrows.id,
                    "event": "click", "payload": {"source_index": 1, "connection": connection}}, [])
    assert len(events) == 1 and events[0].target is arrows
    assert events[0].connection == connection
    assert events[0].connection["source"]["node"] == before.id


def test_html_export_keeps_the_connection_inside_the_target():
    from hmplot.exporter import _html_payload
    with hm.Scene() as scene:
        with hm.Plot(data=PAIRS) as first:
            before = hm.Anchor(x="x0", y="y")
            after = hm.Anchor(x="x1", y="y")
            hm.Segments(connections=hm.connect(before, after, key="id"))
        with hm.Plot(data=PAIRS) as second:
            hm.Points(x="x0", y="y")
    payload, omitted = _html_payload(first)
    state = payload["state"]
    ids = {n["id"] for n in _find(state["root"], lambda n: True)}
    # The export is pruned to the first Plot (no fallback to the whole scene): the refs of its
    # connection all point inside it.
    assert first.id in ids and second.id not in ids and omitted == []
    refs = set(re.findall(r'"\$ref": "([^"]+)"', json.dumps(state)))
    assert refs == {before.id, after.id}


def test_connection_lists_and_texts_match_the_renderer():
    source = Path(__file__).resolve().parents[2] / "src/lib/plot/utils/connections.js"
    node = shutil.which("node")
    if node is None or not source.exists():
        pytest.skip("node or the renderer source is not available")
    script = f"""
const c = await import({json.dumps(source.as_uri())});
console.log(JSON.stringify({{
  version: c.CONNECT_VERSION, kinds: c.CONNECTION_KINDS, endpointKinds: c.ENDPOINT_KINDS,
  compoundEndpointKinds: c.COMPOUND_ENDPOINT_KINDS, channels: c.CONNECTION_CHANNELS, orders: c.ORDERS,
  attachments: Object.fromEntries(Object.keys(c.ATTACHMENTS).map((k) => [k, {{default: c.ATTACHMENTS[k].default, names: c.attachmentNames(k)}}])),
  deferred: c.DEFERRED_ENDPOINTS,
  texts: [c.CONNECT_EMPTY_ERROR, c.singleEndpointError("Sprites 1"), c.CONNECT_ORDER_ARITY_ERROR, c.ENDPOINT_BOTH_ERROR,
    c.EXTERNAL_FACET_ENDPOINT_ERROR, c.connectKeyError(5), c.connectKeyError(["id"]), c.connectOrderError("rows"),
    c.connectVersionError(2), c.connectArgumentError(1), c.connectScopeArgumentError(0), c.endpointAtTypeError(5),
    c.endpointAtError("Rect", "value", c.attachmentNames("Rect")), c.scopeEndpointNameError("Partition"),
    c.connectionsKindError("Points"), c.connectionsChannelError("Line"), c.connectionsSeriesError("Line"),
    c.connectionsValueError("Arrows3D"), c.otherViewError("Line", "here")],
}}));
"""
    result = subprocess.run([node, "--input-type=module", "-e", script], capture_output=True, text=True, check=True)
    js = json.loads(result.stdout)
    assert js["version"] == C.CONNECT_VERSION
    assert tuple(js["kinds"]) == C.CONNECTION_KINDS
    assert tuple(js["endpointKinds"]) == C.ENDPOINT_KINDS
    assert tuple(js["compoundEndpointKinds"]) == C.COMPOUND_ENDPOINT_KINDS
    assert tuple(js["channels"]) == C.CONNECTION_CHANNELS
    assert tuple(js["orders"]) == C.ORDERS
    assert {k: {"default": v["default"], "names": tuple(v["names"])} for k, v in js["attachments"].items()} == C.ATTACHMENTS
    assert js["deferred"] == C.DEFERRED_ENDPOINTS
    # Python writes Python call syntax where the JavaScript text shows JavaScript syntax.
    python_syntax = lambda text: (text.replace("mark.endpoint({at})", "mark.endpoint(at=...)")
                                  .replace('connections={connect(before, after, {key: "id"})}',
                                           'connections=hm.connect(before, after, key="id")'))
    python = [C.CONNECT_EMPTY_ERROR, C.single_endpoint_error("Sprites 1"), C.CONNECT_ORDER_ARITY_ERROR, C.ENDPOINT_BOTH_ERROR,
              C.EXTERNAL_FACET_ENDPOINT_ERROR, C.connect_key_error(5), C.connect_key_error(["id"]),
              C.connect_order_error("rows"), C.connect_version_error(2), C.connect_argument_error(1),
              C.connect_scope_argument_error(0), C.endpoint_at_type_error(5),
              C.endpoint_at_error("Rect", "value", C.ATTACHMENTS["Rect"]["names"]),
              C.scope_endpoint_name_error("Partition"), C.connections_kind_error("Points"),
              C.connections_channel_error("Line"), C.connections_series_error("Line"),
              C.connections_value_error("Arrows3D"), C.other_view_error("Line", "here")]
    assert [python_syntax(text) for text in js["texts"]] == python


def test_connect_example_builds_and_reports_connections(capsys):
    # python/examples/52_connect.py: both plots carry a $connect whose refs are nodes of the
    # plot, and the click callbacks read event.connection the way the browser sends it.
    import runpy
    example = runpy.run_path(str(Path(__file__).resolve().parents[1] / "examples" / "52_connect.py"))
    arrows, before, after = example["arrows"], example["before"], example["after"]
    lines, values = example["lines"], example["values"]
    # The connected points sit in a Frame (owning x) inside the Facet: no Anchors.
    assert (values.kind, values.parent.kind, values.parent.parent.kind) == ("Points", "Frame", "Facet")
    for plot, connector, expected in (
            (example["arrows_plot"], arrows, {"version": 1, "key": "country", "order": None, "endpoints": [
                {"target": {"$ref": before.id}, "at": None}, {"target": {"$ref": after.id}, "at": None}]}),
            (example["parallel"], lines, {"version": 1, "key": None, "order": None, "endpoints": [
                {"target": {"$ref": values.id}, "at": None}]})):
        state, _ = plot._scene()._snapshot()
        json.dumps(state, allow_nan=False)
        node = _find(state["root"], lambda n: n["id"] == connector.id)[0]
        assert node["props"]["connections"] == {"$connect": expected}
        ids = {n["id"] for n in _find(state["root"], lambda n: True)}
        assert set(re.findall(r'"\$ref": "([^"]+)"', json.dumps(state))) <= ids

    def click(target, connection):
        scene = target._scene()
        scene._views["v"] = {"ready": True}
        scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision,
                        "target": target.id, "event": "click",
                        "payload": {"source_index": connection["index"], "connection": connection}}, [])

    slot = lambda index, label, row, node, cell=None, kind="Anchor": {
        "slot": index, "label": label, "definition": f"plot/{label}", "cell": cell, "kind": kind,
        "row": row, "key": f"string:{label}", "node": node}
    kenya = [slot(0, "before", 1, before.id), slot(1, "after", 1, after.id)]
    click(arrows, {"index": 1, "key": "Kenya", "source": kenya[0], "target": kenya[1], "slots": kenya,
                   "pair": kenya, "ownerRow": 1})
    cells = [slot(i, "values", 7, values.id, cell, "Points") for i, cell in enumerate(["bill_length", "bill_depth", "flipper", "mass"])]
    click(lines, {"index": 7, "key": "row:7", "source": cells[0], "target": cells[-1], "slots": cells,
                  "pair": cells[1:3]})
    assert capsys.readouterr().out.splitlines() == ["Kenya: 52.2 -> 61.4 True", "penguin row 7: bill_depth -> flipper"]
