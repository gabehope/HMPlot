"""animate(), tween(), the view clock, and MP4 export (Stage 13 follow-ups, TODO 13.8)."""
import base64
import copy
import io
import os
import json
import pickle
import re
import sys
from pathlib import Path

import numpy as np
import pytest
import hmplot as hm
import hmplot.exporter as exporter
import hmplot.chrome as chrome
from hmplot.data import Column
from hmplot.exporter import _frame_times

RULE = r"animate\(\) must be the outermost operator on a mark channel"
EASING = r'Unknown easing "bogus"; use linear, quad-in, quad-out, quad-in-out, cubic-in, cubic-out, cubic-in-out, sine-in-out\.'


@pytest.mark.parametrize("make", [hm.tween, hm.animate])
def test_options_are_validated_like_the_browser(make):
    with pytest.raises(TypeError, match=EASING):
        make("x", easing="bogus")
    for duration in (float("inf"), float("nan"), -1, True, "500"):
        with pytest.raises(TypeError, match="finite, nonnegative number of milliseconds"):
            make("x", duration=duration)
    # NumPy numbers are accepted and serialize as plain Python numbers.
    tween = hm.tween("x", duration=np.int64(250), easing="sine-in-out")
    assert tween.args[1] == {"$expression_options": {"duration": 250, "easing": "sine-in-out"}}
    assert type(tween.args[1]["$expression_options"]["duration"]) is int
    assert type(hm.animate("x", duration=np.float32(12.5)).duration) is float


def test_tween_has_no_enter_or_exit():
    for option in ("enter", "exit"):
        with pytest.raises(TypeError, match=r"tween\(\) has no enter/exit; only animate\(\) supports enter and exit values\."):
            hm.tween("x", **{option: 0})
    with pytest.raises(TypeError, match="unexpected keyword argument 'speed'"):
        hm.tween("x", speed=2)


@pytest.mark.parametrize("build", [
    lambda: hm.col.x * hm.animate("y"),
    lambda: hm.animate("y") * hm.col.x,
    lambda: hm.sin(hm.animate("y")),
    lambda: hm.tween(hm.animate("y")),
    lambda: hm.mean(hm.animate("y")),
    lambda: hm.is_in(hm.animate("y"), [1, 2]),
    lambda: hm.Calculate(z=hm.col.x + hm.animate("x")),
    lambda: hm.Plot(x={"domain": hm.animate("x")}),
    lambda: hm.Plot(x=hm.animate("x")),
    lambda: hm.Filter(where=hm.animate("x")),
    lambda: hm.Points(x="x", y="y", label=hm.animate("y")),
    lambda: hm.Points(x="x", y="y", enter_effect=hm.animate("y")),
    lambda: hm.Points(x="x", y="y", animation_duration=hm.animate(300)),
    lambda: hm.Points(x="x", y="y", fill=hm.literal(hm.animate("y"))),
    lambda: hm.Points(x="x", y="y", options={"size": [hm.animate("y")]}),
    lambda: hm.rgb(hm.animate("r"), "g", "b"),
], ids=["expr*animate", "animate*expr", "sin", "tween", "reduction", "is_in", "calculate-expression",
        "nested-dict", "plot", "filter", "label", "enter_effect", "animation_duration", "literal",
        "nested-list", "rgb"])
def test_animate_outside_a_mark_channel_is_rejected(build):
    with pytest.raises(TypeError, match=RULE):
        build()


def test_animate_as_a_calculate_output_names_the_column():
    with pytest.raises(TypeError, match=r"Calculate column z: animate\(\) belongs on a mark channel"):
        hm.Calculate(z=hm.animate("x"))


def test_animate_is_accepted_on_every_mark_channel():
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [1.0, 2.0], "y": [1.0, 2.0]}):
            hm.charts.Lollipop(x="x", y=hm.animate("y", duration=400))
            hm.Points(x="x", y="y", opacity=hm.animate(0.3, duration=1000))
            hm.Mapping(y=hm.animate("y"))
    marks = scene._snapshot()[0]["root"]["children"][0]["children"]
    assert marks[0]["props"]["y"] == {"$animate": {"value": "y", "duration": 400}}
    assert marks[1]["props"]["opacity"] == {"$animate": {"value": 0.3, "duration": 1000}}
    # Lollipop is a displayable mark, so it also takes data= on its own.
    assert hm.charts.Lollipop(data={"x": [1.0], "y": [2.0]}, x="x", y="y")._local_data is not None


def test_animate_values_are_snapshotted_and_immutable():
    a = hm.animate(np.array([1.0, 2.0]), duration=np.int64(500), enter=np.float32(0), exit=np.array([1, 0, 0]))
    assert isinstance(a.value, Column)
    assert (a.duration, a.enter, a.exit) == (500, 0.0, [1, 0, 0])
    assert isinstance(hm.animate([3.0, 4.0]).value, Column)
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [1.0, 2.0]}):
            hm.Points(x="x", y=a, fill=hm.animate("x", enter="red"))
    state, columns = scene._snapshot()
    mark = state["root"]["children"][0]["children"][0]["props"]
    assert mark["y"] == {"$animate": {"value": {"$column": a.value.id}, "duration": 500, "enter": 0.0, "exit": [1, 0, 0]}}
    assert mark["fill"] == {"$animate": {"value": "x", "enter": "red"}}
    assert a.value.id in columns
    json.dumps(state, allow_nan=False)
    with pytest.raises(AttributeError, match="immutable"):
        a.duration = -5
    with pytest.raises(AttributeError, match="immutable"):
        del a.easing
    for clone in (copy.copy(a), copy.deepcopy(a), pickle.loads(pickle.dumps(a))):
        assert (clone.duration, clone.enter, clone.exit) == (500, 0.0, [1, 0, 0])
    with pytest.raises(ValueError, match="finite"):
        hm.animate(float("nan"))
    with pytest.raises(TypeError, match="enter must be a finite number, a color, or a list"):
        hm.animate("y", enter=[[1, 2]])
    with pytest.raises(TypeError, match="exit must be a finite number"):
        hm.animate("y", exit=float("inf"))


def test_parent_coordinate_endpoints_and_selection_root_serialize_as_expressions():
    with hm.Scene() as scene:
        with hm.Plot(data={"source": [0], "target": [1]}):
            with hm.GraphData(nodes={"id": [0, 1]}, edges={"source": [0], "target": [1]}, node_key="id", source="source", target="target"):
                with hm.Tree(root=hm.min(hm.col.id), mode="partition", node_width=hm.tween(1.0), layer_height=hm.tween(hm.where(hm.col.id == 0, 0, 1))):
                    with hm.Nodes():
                        hm.Points(x=hm.animate("x", enter=hm.col.parentX, exit=hm.col.parentX))
    state, _ = scene._snapshot()
    tree = state["root"]["children"][0]["children"][0]["children"][0]
    assert tree["props"]["root"]["$expression"]["op"] == "min"
    assert tree["props"]["nodeWidth"]["$expression"]["op"] == "tween"
    assert tree["props"]["layerHeight"]["$expression"]["op"] == "tween"
    channel = tree["children"][0]["children"][0]["props"]["x"]["$animate"]
    assert channel["enter"] == channel["exit"] == {"$expression": {"op": "column", "args": ["parentX"]}}


def test_tree_layout_lifecycle_uses_snake_case_endpoints():
    with hm.Scene() as scene:
        with hm.Plot(data={"source": [0], "target": [1], "length": [2]}):
            with hm.GraphData(source="source", target="target"):
                with hm.Tree(root=0, mode="tidy-approx", edge_length="length", enter=dict(node_width=0, edge_length=0), exit=dict(layer_height=0), animation_duration=600):
                    with hm.Nodes():
                        hm.Points(x="x", y="y", opacity="presence")
    state, _ = scene._snapshot()
    props = state["root"]["children"][0]["children"][0]["children"][0]["props"]
    assert props["enter"] == {"nodeWidth": 0, "edgeLength": 0}
    assert props["exit"] == {"layerHeight": 0}
    assert props["edgeLength"] == "length"
    with pytest.raises(ValueError, match="finite, nonnegative"):
        hm.Tree(root=0, enter=dict(edge_length=-1))
    with pytest.raises(ValueError, match="unknown key"):
        hm.Tree(root=0, exit=dict(position=0))
    with pytest.raises(TypeError, match="pass a dict"):
        hm.Tree(root=0, enter=True)


def test_frame_times_follow_a_documented_rule():
    # Every frame time before start + duration: ceil(duration * fps / 1000) frames.
    assert _frame_times(0, 150, 10) == [0, 100]
    assert _frame_times(0, 250, 10) == [0, 100, 200]
    assert len(_frame_times(0, 1000, 30)) == 30
    assert len(_frame_times(0, 1000, 60)) == 60
    assert _frame_times(np.int64(0), np.int64(300), np.int32(10)) == [0, 100, 200]
    for bad in ({"duration": float("inf")}, {"fps": 0}, {"fps": float("nan")}, {"start": -1}, {"duration": True}):
        with pytest.raises(ValueError):
            _frame_times(**{"start": 0, "duration": 100, "fps": 10, **bad})


class ClockView:
    """A displayed view that answers `time` and `export_png` like the browser runtime."""

    def __init__(self, scene, time=250.0, frozen=True):
        self.scene, self.time, self.frozen = scene, time, frozen
        self.messages = []
        scene._views["v"] = {"ready": True}
        scene._widget = self

    def send(self, message):
        if message.get("type") != "command":
            return
        self.messages.append(message)
        args, buffers = message["args"], []
        if message["command"] == "time":
            if "time" in args:
                if args["time"] is None:
                    self.frozen = False
                else:
                    self.time, self.frozen = args["time"], args["freeze"]
            value = {"time": self.time, "frozen": self.frozen}
        else:
            value, buffers = None, [b"\x89PNG"]
        self.scene._receive({"type": "result", "scene": self.scene.id,
                             "request": message["request"], "value": value}, buffers)

    def commands(self, name=None):
        return [(m["command"], m["target"], {k: v for k, v in m["args"].items() if k != "timeoutMs"})
                for m in self.messages if name in (None, m["command"])]


@pytest.fixture
def stitched(monkeypatch):
    """Record the videos that would be encoded, (path, fps, frames), instead of running ffmpeg."""
    calls = []

    class Writer:
        def __init__(self, ffmpeg, path, fps):
            self.path, self.fps, self.frames = path, fps, 0
        def write(self, png):
            self.frames += 1
        def close(self):
            calls.append((self.path, self.fps))
            return self.path
        def abort(self):
            pass
    monkeypatch.setattr(exporter, "_Mp4Writer", Writer)
    return calls


def plot_scene():
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [0.0, 1.0], "y": [0.0, 1.0]}) as plot:
            hm.Points(x="x", y=hm.col.y + hm.sin(hm.view.time / 100))
    return scene, plot


@pytest.mark.asyncio
@pytest.mark.parametrize("frozen", [True, False])
async def test_export_mp4_restores_the_previous_clock(stitched, frozen, tmp_path):
    scene, plot = plot_scene()
    view = ClockView(scene, time=250.0, frozen=frozen)
    assert await plot.export_mp4(tmp_path / "clip.mp4", duration=300, fps=10) == tmp_path / "clip.mp4"
    times = view.commands("time")
    assert times[0] == ("time", plot.id, {})
    assert [args["time"] for _, _, args in times[1:-1]] == [0, 100, 200]
    assert times[-1] == ("time", plot.id, {"time": 250.0, "freeze": frozen})
    assert (view.time, view.frozen) == (250.0, frozen)
    assert len(view.commands("export_png")) == 3 and stitched == [(tmp_path / "clip.mp4", 10)]


@pytest.mark.asyncio
async def test_export_mp4_restores_the_clock_when_a_frame_fails(stitched, monkeypatch, tmp_path):
    scene, plot = plot_scene()
    view = ClockView(scene, time=40.0, frozen=False)
    exported = []

    async def export_png(self, path=None, **options):
        exported.append(path)
        if len(exported) == 2:
            raise RuntimeError("frame failed")

    monkeypatch.setattr(hm.Node, "export_png", export_png)
    with pytest.raises(RuntimeError, match="frame failed"):
        await plot.export_mp4(tmp_path / "clip.mp4", duration=500, fps=10)
    assert view.commands("time")[-1] == ("time", plot.id, {"time": 40.0, "freeze": False})
    assert (view.time, view.frozen) == (40.0, False)
    assert stitched == []


@pytest.mark.asyncio
async def test_export_mp4_checks_ffmpeg_and_suffix_before_the_first_frame(monkeypatch, tmp_path):
    scene, plot = plot_scene()
    view = ClockView(scene)
    with pytest.raises(ValueError, match=r"\.mp4"):
        await plot.export_mp4(tmp_path / "clip.gif", duration=100)
    with pytest.raises(ValueError, match='encoder is "ffmpeg" or "browser"'):
        await plot.export_mp4(tmp_path / "clip.mp4", duration=100, encoder="gpu")
    # ffmpeg comes from imageio-ffmpeg, a dependency; without it the export says so.
    monkeypatch.setitem(sys.modules, "imageio_ffmpeg", None)
    with pytest.raises(RuntimeError, match="needs imageio-ffmpeg"):
        await plot.export_mp4(tmp_path / "clip.mp4", duration=100)
    assert view.messages == []
    # The headless exporter checks before it launches a browser.
    with exporter.ExportSession() as session:
        with pytest.raises(RuntimeError, match="needs imageio-ffmpeg"):
            session.mp4(plot, tmp_path / "clip.mp4", duration=100)
        assert session.page is None


@pytest.mark.asyncio
async def test_clock_commands_resolve_the_export_target(stitched, tmp_path):
    # A mark displayed on its own is exported (and clocked) through its implicit Plot.
    mark = hm.Points(data={"x": [0.0, 1.0], "y": [0.0, 1.0]}, x="x",
                            y=hm.col.y + hm.sin(hm.view.time / 100))
    scene = mark._scene()
    implicit = scene.children[0].id
    view = ClockView(scene, time=0.0, frozen=False)
    assert await mark.set_time(np.int64(75)) == 75.0
    assert await mark.get_time() == 75.0
    await mark.export_mp4(tmp_path / "clip.mp4", duration=200, fps=10)
    assert {target for _, target, _ in view.commands()} == {implicit}
    # A Scene sets every clock inside it; the runtime reports the first.
    scene, _ = plot_scene()
    view = ClockView(scene)
    await scene.export_mp4(tmp_path / "scene.mp4", duration=100, fps=10)
    assert {target for _, target, _ in view.commands()} == {scene.id}


@pytest.mark.asyncio
@pytest.mark.parametrize("time", [-1, float("nan"), float("inf"), True, "10"])
async def test_set_time_rejects_invalid_times(time):
    scene, plot = plot_scene()
    view = ClockView(scene)
    with pytest.raises(TypeError, match="finite, nonnegative number of milliseconds"):
        await plot.set_time(time)
    assert view.messages == []


# Headless Chrome (hmplot/chrome.py finds one); skipped where none can launch.
@pytest.fixture(scope="module")
def session():
    session = exporter.ExportSession().__enter__()
    try:
        session._ensure_browser()
    except Exception as error:  # no browser or no WebGPU on this machine
        pytest.skip(f"headless export unavailable: {error}")
    yield session
    session.__exit__(None, None, None)


def test_headless_animation_groups_export_filtered_snapshots_and_sibling_overrides(session):
    import xml.etree.ElementTree as ET
    rows = {"country": ["A", "B", "B", "A"], "slot": ["L", "R", "L", "R"],
            "year": [0, 0, 1, 1], "x": [0.0, 10.0, 30.0, 20.0]}
    timing = {"duration": 1000, "easing": "linear"}
    with hm.Data(rows, key=["country", "year"], animation_group="country"):
        with hm.Plot(width=640, height=400, responsive=False, axes2d=False,
                     x={"domain": [-5, 35]}, y={"domain": [0, 5]}) as plot:
            with hm.Filter(where=hm.col.year == hm.floor(hm.view.time / 1000)):
                hm.Points(x=hm.animate("x", **timing), y=1, fill="red", size=8)
                with hm.Calculate(motion=hm.tween("x", **timing)):
                    hm.Points(x="motion", y=2, fill="blue", size=8)
            with hm.Frame(animation_group="slot"):
                # Omitted group on nested Data inherits the Frame's subtree override.
                with hm.Data(rows, key=["country", "year"]):
                    with hm.Filter(where=hm.col.year == hm.floor(hm.view.time / 1000)):
                        hm.Points(x=hm.tween("x", **timing), y=3, fill="green", size=8)
            with hm.Frame(animation_group=None):
                with hm.Filter(where=hm.col.year == hm.floor(hm.view.time / 1000)):
                    hm.Points(x=hm.tween("x", **timing), y=4, fill="purple", size=8)

    def drawn():
        circles = ET.fromstring(session.svg(plot, mode="vector")).findall(".//{http://www.w3.org/2000/svg}circle")
        bands = {}
        for circle in circles:
            bands.setdefault(round(float(circle.attrib["cy"]), 3), []).append(float(circle.attrib["cx"]))
        return [sorted(bands[y]) for y in sorted(bands, reverse=True)]

    session.set_time(plot, 0)
    initial = drawn()
    assert len(initial) == 4 and all(len(band) == 2 for band in initial)
    origin, ten = initial[0]
    unit = (ten - origin) / 10
    session.set_time(plot, 1000)
    session.set_time(plot, 1500)
    half = drawn()
    for actual, expected in zip(half, [[10, 20], [10, 20], [15, 15], [20, 30]]):
        assert actual == pytest.approx([origin + unit * x for x in expected], abs=0.02)
    assert session.png(plot, scale=2).startswith(b"\x89PNG")


def test_headless_choropleth_with_hover_respond_and_tooltip_draws(session):
    # 2026-10-22: a GeoJSON's faces read three corners, a height and a joined flag per row besides
    # the point channels; with hover, respond and a tooltip they needed 9 vertex buffers of 8, the
    # pipeline was invalid and the map drew nothing. The fields past the budget now read from
    # storage.
    square = lambda x, k: {"type": "Feature", "properties": {"id": k, "v": x}, "geometry": {
        "type": "Polygon", "coordinates": [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]]}}
    geo = {"type": "FeatureCollection", "features": [square(i, f"k{i}") for i in range(4)]}
    focus = hm.selection()
    with hm.Plot(coordinates="spherical", projection="mercator", height=200) as plot:
        hm.GeoJSON(data=geo, fill="v", outline_width=hm.where(focus, 3.0, 0.8), hover=focus, respond=focus,
                   tooltip=["id", "v"])
    found = hm.check(plot, session=session, vector=False)
    assert found.ok and found.errors == [], found.errors


def test_headless_data_generates_rows_without_uploaded_columns(session):
    import xml.etree.ElementTree as ET
    with hm.Data(rows=7):
        with hm.Plot(width=320, height=200, responsive=False,
                     x={"domain": [-1, 8]}, y={"domain": [0, 2]}) as plot:
            hm.Points(x=hm.row(), y=1, size=8)
    svg = session.svg(plot, mode="vector")
    circles = ET.fromstring(svg).findall(".//{http://www.w3.org/2000/svg}circle")
    assert len(circles) == 7
    assert len({circle.attrib["cy"] for circle in circles}) == 1
    assert len({circle.attrib["cx"] for circle in circles}) == 7


def test_headless_facet_cell_export(session):
    with hm.Scene():
        with hm.Data({"x": [0.0, 1.0, 2.0, 3.0], "y": [1.0, 2.0, 3.0, 4.0], "g": ["a", "a", "b", "b"]}):
            with hm.Facet(column="g"):
                with hm.Plot() as plot:
                    hm.Points(x="x", y="y")
    cells = session.png(plot, cells=True)
    assert sorted(cell["column"] for cell in cells) == ["a", "b"]
    assert all(cell["data"].startswith(b"\x89PNG") for cell in cells)


def test_check_reports_what_was_drawn_with_a_png(session):
    # R2.8: hm.check draws the scene as the exports do and says what it drew: each mark's rows
    # and columns, the axes' ranges, the plot's size, what SVG draws as images, and a PNG.
    data = {"x": [1.0, 2.0, 3.0, 4.0], "y": [3.0, 1.0, 4.0, 2.0], "group": ["a", "b", "a", "b"]}
    with hm.Scene() as scene:
        with hm.Plot(data=data, height=200, width=320, axes2d=True, title="Four points"):
            hm.Points(x="x", y="y", fill="group")
            hm.Line(x="x", y="y")
        with hm.Plot(height=150, width=200):
            hm.Heatmap(fill=np.arange(12.0).reshape(3, 4))
    result = hm.check(scene, scale=2, session=session)
    assert result.ok, result.errors
    first = result.plots[0]
    assert (first["title"], first["width"]) == ("Four points", 320)
    assert result.plots[1]["width"] == 200
    assert [(mark["kind"], mark["rows"]) for mark in first["model"]["marks"]] == [("Points", 4), ("Line", 4)]
    assert first["model"]["marks"][0]["categories"]["fill"] == ["a", "b"]
    assert first["model"]["axes"]["y"]["low"] < "1.1" and first["model"]["axes"]["y"]["kind"] == "numeric"
    assert any("Heatmap" in warning and "as images" in warning for warning in result.warnings)
    width, height = result.png_size
    assert result.png[:8] == b"\x89PNG\r\n\x1a\n" and width >= 640 and height >= 2 * 200
    text = result.summary()
    assert "Points: 4 rows; x: x, y: y, fill: group" in text and "Heatmap: drawn from arrays" in text
    # A mistake the browser finds is an error naming the mark and the fix; one Python finds needs
    # no browser.
    with hm.Plot(data=data, height=200) as broken:
        hm.Points(x="x", y="yy")
    found = hm.check(broken, session=session)
    assert not found.ok and found.png is None
    assert re.search(r'Points\.y references missing field "yy" .*Did you mean "y"\?', found.errors[0])
    assert hm.check(hm.Points(x="x", y="y")).errors == [
        "ValueError: Standalone Points display requires data=; use Plot for inherited data."]


def test_check_lints_what_does_nothing_and_strict_counts_them(session):
    # TODO 136.13: a Legend whose channel no mark maps draws nothing; check lists it as a lint
    # naming the Legend's own node, and strict=True makes it an error.
    data = {"x": [1.0, 2.0, 3.0], "y": [3.0, 1.0, 2.0]}
    with hm.Plot(data=data, height=200) as plot:
        hm.Points(x="x", y="y", fill="red")
        legend = hm.Legend(channel="fill")
    found = hm.check(plot, session=session, vector=False)
    assert found.ok and found.errors == []
    assert found.lints == ['Legend: none of its marks maps fill from data, so it shows nothing. '
                           'Map fill from a column (fill="column"), or remove the Legend.']
    (entry,) = found.diagnostics
    assert (entry["severity"], entry["code"], entry["node"]) == ("lint", "lint.legend-empty", legend.id)
    assert "lints:\n  - Legend: none of its marks" in found.summary()
    strict = hm.check(plot, session=session, vector=False, strict=True)
    assert not strict.ok and (strict.errors, strict.lints) == (found.lints, [])
    # A Legend that cannot explain its channel (a constant size) is a lint too, not a warning.
    with hm.Plot(data=data, height=200) as constant:
        points = hm.Points(x="x", y="y", size=8)
        hm.Legend(target=points, channel="size")
    found = hm.check(constant, session=session, vector=False)
    assert found.lints == ["Legend: A size legend needs size mapped from a data column or sizeScale."], found
    # A mark that drew no rows lints (2026-10-22, lint.mark-empty; it was a warning Python added):
    # a Filter keeping none here, the same lint for a Join matching none or an empty layout.
    with hm.Plot(data=data, height=150) as empty:
        with hm.Filter(where=hm.col.x > 1e9):
            hm.Points(x="x", y="y")
    found = hm.check(empty, session=session, vector=False)
    assert found.ok and found.warnings == []
    (entry,) = [d for d in found.diagnostics if d["code"] == "lint.mark-empty"]
    assert entry["component"] == "Points" and entry["message"].startswith("Points: drew no rows")
    # A Filter on "@brushed" over data no mark brushes (each Plot given its own data) keeps the
    # same rows whatever the viewer does; over the brushed Data it lints nothing.
    with hm.Column() as unlinked:
        with hm.Plot(data=data, height=150):
            hm.Points(x="x", y="y", brush=True)
        with hm.Plot(data=dict(data), height=150):
            with hm.Filter(where="@brushed") as brushed:
                hm.Points(x="x", y="y")
    (entry,) = hm.check(unlinked, session=session, vector=False).diagnostics
    assert (entry["code"], entry["component"], entry["property"], entry["node"]) == (
        "lint.interaction-unset", "Filter", "where", brushed.id)
    assert entry["message"].startswith('Filter: no mark drawing this data has brush=True, so "@brushed" never changes')
    with hm.Data(data):
        with hm.Column() as linked:
            with hm.Plot(height=150):
                hm.Points(x="x", y="y", brush=True)
            with hm.Plot(height=150):
                with hm.Filter(where="@brushed"):
                    hm.Points(x="x", y="y")
    assert hm.check(linked, session=session, vector=False).diagnostics == []
    # An unknown colormap name is an error naming the mark, not Viridis drawn in silence.
    with pytest.raises(ValueError, match=r"^Points\.colormap: Unknown colormap: blues\."):
        hm.Points(x="x", y="y", fill="y", colormap="blues")


def test_check_lints_scales_and_legends(session):
    # TODO 136.13, slice 3 (134.18, 135.10). A color mapped from data with no legend (here
    # legend=False) lints on the mark's own node; a Legend for it, the Plot's default legend for a
    # category column (136.17), or the same column on an axis, clears it.
    data = {"x": [1.0, 2.0, 3.0, 4.0], "y": [3.0, 1.0, 2.0, 5.0], "c": ["a", "b", "a", "b"]}
    with hm.Plot(data=data, height=200, legend=False) as plot:
        points = hm.Points(x="x", y="y", fill="c")
    (entry,) = hm.check(plot, session=session, vector=False).diagnostics
    assert {key: entry[key] for key in ("severity", "code", "component", "property", "node")} == {
        "severity": "lint", "code": "lint.color-unexplained", "component": "Points", "property": "fill", "node": points.id}
    assert entry["message"].startswith('Points.fill: colors its marks by "c", but no legend says which color is which.')
    with hm.Plot(data=data, height=200) as explained:
        hm.Points(x="x", y="y", fill="c")
        hm.Legend(channel="fill")
    with hm.Plot(data=data, height=200) as defaulted:
        hm.Points(x="x", y="y", fill="c")
    with hm.Plot(data=data, height=200) as redundant:
        hm.charts.Bar(x="c", y="y", fill="c")
    # A Facet's legend claims one cell's mount; every cell shares its scale.
    with hm.Plot(data=dict(data, g=["p", "p", "q", "q"]), height=300, legend=True) as faceted:
        with hm.Facet(column="g"):
            hm.Points(x="x", y="y", fill="c")
    for plot in (explained, defaulted, redundant, faceted):
        assert hm.check(plot, session=session, vector=False).diagnostics == []
    # An explicit y domain 250 times wider than the data squeezes the points into a line.
    with hm.Plot(data=data, y={"domain": [0, 1000]}, height=200) as wide:
        hm.Points(x="x", y="y")
    assert hm.check(wide, session=session, vector=False).lints == [
        "Plot.y: the y domain 0 to 1000 is far wider than the data (1 to 5), so the marks fill under 1% of the "
        "axis. Narrow the domain, or leave it out to fit the data."]
    with hm.Plot(data=data, y={"domain": [0, 10]}, height=200) as fitted:
        hm.Points(x="x", y="y")
    assert hm.check(fitted, session=session, vector=False).lints == []
    # A size scale with a domain and no range (135.10): the points draw at the automatic size range, not invisibly small, and
    # the size legend explains them.
    with hm.Plot(data=data, height=200, width=300, responsive=False) as sized:
        hm.Points(x="x", y="y", size="y", size_scale=hm.continuous(domain=[0, 10]), fill="#d62728")
        hm.Legend(channel="size")
    # A size the scale cannot take (one value) draws as before; a log domain through 0 is an
    # error where the scale is made.
    with hm.Plot(data=dict(data, k=[2.0] * 4), height=200) as degenerate:
        hm.Points(x="x", y="y", size="k", size_scale=hm.continuous(transform="sqrt"))
    with pytest.raises(ValueError, match="Log normalization needs positive domain endpoints"):
        hm.continuous(domain=[0, 10], transform="log")
    assert hm.check(degenerate, session=session, vector=False).ok
    found = hm.check(sized, session=session, vector=False)
    assert found.ok and found.diagnostics == [], found
    from PIL import Image
    red, green, blue = np.asarray(Image.open(io.BytesIO(found.png)).convert("RGB")).astype(int).transpose(2, 0, 1)
    assert ((red > 180) & (green < 90) & (blue < 90)).sum() > 40


def test_check_lints_the_drawn_layout(session):
    # TODO 136.13, slice 4 (134.18, 134.33). Category labels hidden where they would overlap.
    names = [f"category number {i}" for i in range(30)]
    with hm.Plot(data={"name": names, "v": list(range(30))}, width=300, height=200, responsive=False) as crowded:
        hm.charts.Bar(x="name", y="v")
    found = hm.check(crowded, session=session, vector=False)
    (entry,) = found.diagnostics
    assert (entry["code"], entry["component"], entry["property"]) == ("lint.labels-hidden", "Plot", "x")
    assert re.match(r"Plot\.x: \d+ of 30 category labels are hidden", entry["message"]), entry
    # The check's PNG is the plot's own size, not the page's width with the plot stretched across it.
    assert found.png_size == (300, 200)
    with hm.Plot(data={"name": ["north", "south", "east"], "v": [1, 2, 3]}, width=300, height=200, responsive=False) as roomy:
        hm.charts.Bar(x="name", y="v")
    assert hm.check(roomy, session=session, vector=False).lints == []
    # An explicit domain that holds none of the data draws nothing; in 3D, data past it draws
    # outside the axes.
    data = {"x": [0.0, 1.0, 2.0], "y": [20.0, 25.0, 30.0], "z": [10.0, 20.0, 30.0], "pop": [1e6, 3e6, 8e6]}
    with hm.Plot(data=data, y={"domain": [0, 10]}, height=200) as empty:
        hm.Points(x="x", y="y")
    assert hm.check(empty, session=session, vector=False).lints == [
        "Plot.y: the y domain 0 to 10 holds none of the data (20 to 30), so the plot draws nothing. "
        "Move the domain over the data, or leave it out to fit the data."]
    with hm.Plot(type="3d", data=data, z={"domain": [0, 25]}, height=300) as solid:
        hm.Points3D(x="x", y="y", z="z")
    (entry,) = hm.check(solid, session=session, vector=False).diagnostics
    assert (entry["code"], entry["property"]) == ("lint.marks-outside", "z")
    assert entry["message"].startswith("Plot.z: the data runs from 10 to 30, past the z domain 0 to 25")
    # A size drawn as pixels: a population over 10,000 is points 800 px across.
    with hm.Plot(data=data, height=300) as covered:
        points = hm.Points(x="x", y="y", size=hm.col("pop") / 1e4)
    (entry,) = hm.check(covered, session=session, vector=False).diagnostics
    assert (entry["code"], entry["component"], entry["node"]) == ("lint.markers-cover", "Points", points.id)
    assert entry["message"].startswith("Points.size: its largest point is 800 px across")
    with hm.Plot(data=data, height=300) as scaled:
        hm.Points(x="x", y="y", size="pop")
    assert hm.check(scaled, session=session, vector=False).lints == []


def test_curved_routes_past_one_batch_draw_and_a_failed_one_reports_promptly(session):
    # TODO 136.11 (135.2): 1,100 curved routes on a map, past one batch of 1,024 paths, draw.
    import time
    n = 1100
    start = np.column_stack([np.linspace(-120, -70, n), np.full(n, 35.0)])
    end = np.column_stack([np.linspace(-70, -120, n), np.full(n, 45.0)])
    with hm.Plot(coordinates="spherical", projection="mercator", height=240) as plot:
        hm.Segments(start=start, end=end, curve="quadratic", control1=np.column_stack([start[:, 0], end[:, 1]]))
    found = hm.check(plot, session=session, timeout=20)
    assert found.ok, found.errors
    # TODO 136.2: routes whose detail is past their budget used to keep the frame waiting until
    # check() timed out, then failed the mark. 2026-10-23: they draw at the budget, promptly
    # (zoomed far in, every curve is past its tolerance somewhere off screen).
    start = np.column_stack([np.linspace(-170, -10, n), np.full(n, -70.0)])
    end = np.column_stack([np.linspace(10, 170, n), np.full(n, 75.0)])
    with hm.Plot(coordinates="spherical", projection="mercator", width=900, height=600, subdivision_tolerance=0.01) as plot:
        hm.Segments(start=start, end=end, curve="quadratic", control1=np.column_stack([start[:, 0], end[:, 1]]))
    started = time.monotonic()
    found = hm.check(plot, session=session, timeout=20)
    assert time.monotonic() - started < 15
    assert found.ok and found.errors == [], found.errors
    # A list of columns where a mark takes positions is an error naming the fix, before the browser.
    with pytest.raises(TypeError, match=r"Segments\.start takes one column of positions .*np\.column_stack"):
        hm.Segments(start=["x0", "y0"], end=["x1", "y1"])
    # A missing column: its code, component, property and the hint, structured.
    with hm.Plot(data={"x": [1.0, 2.0], "y": [1.0, 2.0]}, height=200) as missing:
        points = hm.Points(x="x", y="yy")
    (entry,) = hm.check(missing, session=session).diagnostics
    assert {key: entry[key] for key in ("severity", "code", "component", "property", "hint", "node")} == {
        "severity": "error", "code": "data.missing_field", "component": "Points", "property": "y",
        "hint": 'Did you mean "y"?', "node": points.id}
    # A component outside every Plot reports through its scene node, not the page's alerts.
    with hm.Scene() as inputs:
        with hm.Data({"x": [1.0, 2.0]}):
            slider = hm.Slider(name="start", min=hm.min("nope"), max=hm.max("x"))
            hm.Plot(height=120)
    entries = [(d["component"], d["node"]) for d in hm.check(inputs, session=session).diagnostics]
    assert ("Slider", slider.id) in entries, entries


def test_a_pie_in_a_plot_draws_no_cartesian_axes(session):
    # TODO 134.8: a Pie places its own polar Frame; the Plot's Cartesian root has nothing in it
    # and draws no axes (it drew -0.5 to 0.5 ticks and gridlines behind the pie). No legend: its
    # category names are text too.
    data = {"k": ["a", "b", "c"], "v": [1, 2, 3]}
    with hm.Plot(data=data, height=240, legend=False) as plot:
        hm.charts.Pie(category="k", value="v")
    assert "<text" not in session.svg(plot).decode()
    with hm.Plot(data=data, height=240) as scatter:
        hm.Points(x="v", y="v")
    assert "<text" in session.svg(scatter).decode()
    with pytest.raises(ValueError, match='coordinates="polar"'):
        hm.Plot(type="polar")


def test_check_timeout_covers_initial_preparation_and_recovers(session):
    # Delay a real GPU readback rather than relying on machine speed to exceed the budget.
    # check(timeout=...) must reach the initial apply, not only subsequent settle calls.
    import xml.etree.ElementTree as ET

    with hm.Plot(data={"x": [0.0], "y": [0.0]}, width=160, height=120, responsive=False) as plot:
        hm.Points(x="x", y="y", size=32, fill="#ff0000")
    warm = hm.check(plot, session=session, vector=False)
    assert warm.ok, warm.errors
    session.page.evaluate("""() => {
      const original = GPUBuffer.prototype.mapAsync;
      window.checkDelay = { original, pending: null };
      GPUBuffer.prototype.mapAsync = function(...args) {
        const result = original.apply(this, args);
        if (window.checkDelay.pending) return result;
        return window.checkDelay.pending = result.then(() => new Promise(resolve => setTimeout(resolve, 200)));
      };
    }""")
    try:
        failed = hm.check(plot, session=session, vector=False, timeout=0.05)
        assert not failed.ok
        # The timeout names what was still preparing (TODO 136.6).
        assert any(error.startswith("Scene command timed out during component preparation. Still waiting on: Plot ")
                   for error in failed.errors), failed.errors
    finally:
        delayed = session.page.evaluate("""async () => {
          const delay = window.checkDelay;
          GPUBuffer.prototype.mapAsync = delay.original;
          await delay.pending;
          delete window.checkDelay;
          return delay.pending !== null;
        }""")
    assert delayed, "the test exercised asynchronous preparation"
    recovered = hm.check(plot, session=session, vector=False)
    assert recovered.ok, recovered.errors
    assert recovered.plots[0]["model"]["marks"][0]["rows"] == 1
    assert recovered.png.startswith(b"\x89PNG")
    drawing = ET.fromstring(session.svg(plot, mode="vector"))
    circles = drawing.findall(".//{http://www.w3.org/2000/svg}circle")
    assert len(circles) == 1 and circles[0].get("fill") == "#ff0000"
    assert float(circles[0].get("r")) > 0


def test_check_command_runs_a_program_and_saves_its_png(session, tmp_path):
    # `hmplot check FILE.py` (R2.8): the program's last expression is what it checks, as a
    # notebook cell displays it; a failing program reports the line.
    import subprocess
    program = tmp_path / "scatter.py"
    program.write_text('import hmplot as hm\n\nwith hm.Plot(data={"x": [1, 2], "y": [2, 1]}, height=200) as plot:\n'
                       '    hm.Points(x="x", y="y")\nplot\n')
    env = {**os.environ, "PYTHONPATH": str(Path(hm.__file__).parents[1])}
    run = subprocess.run([sys.executable, "-m", "hmplot", "check", str(program), "--json"], capture_output=True, text=True, env=env)
    assert run.returncode == 0, run.stdout + run.stderr
    report = json.loads(run.stdout)
    assert report["ok"] and report["plots"][0]["model"]["marks"][0]["rows"] == 2
    assert Path(report["png_file"]).read_bytes()[:4] == b"\x89PNG"
    program.write_text('import hmplot as hm\n\nhm.Points(x="x", colr="red")\n')
    run = subprocess.run([sys.executable, "-m", "hmplot", "check", str(program)], capture_output=True, text=True, env=env)
    assert run.returncode == 1
    assert "scatter.py:3: TypeError: Points: unknown property 'colr'. Did you mean 'color'?" in run.stdout
    # TODO 133.10: a plot built inside main() and exported leaves nothing behind; the check
    # draws what the program exported ("builds no plot" before).
    program.write_text('import hmplot as hm\n\ndef main():\n'
                       '    with hm.Plot(data={"x": [1, 2, 3], "y": [2, 1, 3]}, height=200) as plot:\n'
                       '        hm.Points(x="x", y="y")\n'
                       '    hm.export_html(plot, "page.html", snapshot=False)\n\n'
                       'if __name__ == "__main__":\n    main()\n')
    run = subprocess.run([sys.executable, "-m", "hmplot", "check", str(program), "--json"], capture_output=True, text=True, env=env)
    assert run.returncode == 0, run.stdout + run.stderr
    assert json.loads(run.stdout)["plots"][0]["model"]["marks"][0]["rows"] == 3


def test_skill_programs_draw_without_errors(session):
    # R2.7: each of the agent skill's programs draws, every mark with rows, as hm.check sees it.
    from test_api_consistency import SKILL_PROGRAMS, skill_scene
    for name, code in SKILL_PROGRAMS:
        # The million-point program is also drawn on CI's software GPU. Keep every row and
        # allow slow preparation; this is an example-correctness check, not a speed gate.
        result = hm.check(skill_scene(code), session=session, vector=False, timeout=180)
        assert result.ok, f"{name}: {result.errors}"
        assert result.plots and not [note for note in result.warnings + result.lints if "drew no rows" in note], name


def test_headless_orthographic_viewport_and_vector_export(session):
    with hm.Scene():
        with hm.Plot(coordinates="spherical", projection="orthographic",
                     width=400, height=400) as plot:
            hm.Points(position=[[0, 0]], size=28, fill="#2468a0")
            hm.Points(position=[[180, 0]], size=28, fill="#c73b2b")
    assert session.get_viewport(plot)["center"] == [0, 0]
    before = session.png(plot, scale=1)
    moved = session.set_viewport(plot, center=[180, 0])
    assert abs(moved["center"][0]) == 180
    assert session.get_viewport(plot)["center"] == moved["center"]
    after = session.png(plot, scale=1)
    assert before.startswith(b"\x89PNG") and after.startswith(b"\x89PNG")
    assert before != after
    svg = session.svg(plot, mode="vector")
    assert b"<image" not in svg and b"#c73b2b" in svg


def test_headless_outline_channels_render_and_export_from_python(session):
    import base64
    import xml.etree.ElementTree as ET
    with hm.Plot(width=400, height=240, axes2d=False, axis_mask=False,
                 tone_mapping=0, background="white", x={"domain": [0, 4]}, y={"domain": [0, 3]}) as plot:
        hm.Rect(x0=[0.5, 2.5], x1=[1.5, 3.5], y0=1, y1=2, fill="#d0d0d0",
                outline_color="#e60000", outline_width=[4, 8], outline_opacity=[1, 0.5])
    svg = ET.fromstring(session.svg(plot, mode="vector"))
    strokes = [p.attrib["stroke"] for p in svg.findall(".//{http://www.w3.org/2000/svg}path") if "stroke-opacity" in p.attrib]
    assert strokes == ["#e60000", "#db9898"]  # Border alpha mixes over the fill in linear RGB.
    png = session.png(plot, scale=2)
    counts = session.page.evaluate("""async encoded => {
        const bytes = Uint8Array.from(atob(encoded), c=>c.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
        const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
        const ctx=canvas.getContext('2d'); ctx.drawImage(image,0,0); image.close();
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        const counts=[0,0];
        for(let i=0;i<pixels.length;i+=4)
            if(pixels[i]>140 && pixels[i+1]<80 && pixels[i+2]<80) counts[i/4%canvas.width<canvas.width/2?0:1]++;
        return counts;
    }""", base64.b64encode(png).decode())
    assert counts[0] > 100 and counts[1] == 0
    assert session.pdf(plot, mode="vector").startswith(b"%PDF")


def test_headless_pdf_embeds_the_default_font(session):
    # TODO 52: text prints in the bundled Source Sans 3, embedded as a subset of the glyphs used;
    # a theme font without a generic family prints in it too, and the report says so.
    import re

    with hm.Scene():
        with hm.Plot(height=200, axes2d=True) as plot:
            hm.Line(x=[0.0, 1.0, 2.0], y=[-1.0, 0.0, 1.0])
    pdf = session.pdf(plot)
    assert re.search(rb"/BaseFont /[A-Z]{6}\+SourceSans3-Regular", pdf) and b"/FontFile2" in pdf
    assert b"/Times-Roman" not in pdf and b"/Helvetica" not in pdf
    assert [(font["family"], font["embedded"]) for font in session.last_report["fonts"]] == [("Source Sans 3", True)]
    roboto = hm.create_theme(typography={"font_family": "Roboto"})
    with hm.Scene(theme=roboto):
        with hm.Plot(height=200, axes2d=True) as plot:
            hm.Line(x=[0.0, 1.0, 2.0], y=[-1.0, 0.0, 1.0])
    pdf = session.pdf(plot)
    assert re.search(rb"/BaseFont /[A-Z]{6}\+SourceSans3-Regular", pdf) and b"/Times-Roman" not in pdf
    assert "Font substitution: Roboto → Source Sans 3 (embedded)." in session.last_report["warnings"]



@pytest.mark.parametrize("view_type", ["3d", "3d-y-up"])
def test_headless_z_up_surface_exports_pdf_and_html(session, view_type):
    # Non-Y up vectors have harmless OrbitControls matrix drift. Projected axes must
    # settle despite it, including the full 150 x 150 terrain grid from the PDF task.
    import xml.etree.ElementTree as ET

    axis = np.linspace(0, 10, 150)
    heights = np.sin(axis[:, None]) + np.cos(axis[None, :])
    with hm.Plot(type=view_type, title="Terrain", height=400,
                 x={"label": "x (km)"}, y={"label": "y (km)"},
                 z={"label": "elevation (m)"}, axes3d=True) as plot:
        hm.Surface(x=axis, y=axis, height=heights, fill=heights)
    svg = ET.fromstring(session.svg(plot, width="120mm"))
    assert svg.findall(".//{http://www.w3.org/2000/svg}image")
    text = " ".join(svg.itertext())
    for label in ("Terrain", "x (km)", "y (km)", "elevation (m)"):
        assert label in text
    pdf = session.pdf(plot, width="120mm", text="embedded")
    assert pdf.startswith(b"%PDF") and b"/FontFile2" in pdf
    assert b'hmplot-snapshot' in session.html(plot)
    assert session.page.evaluate("() => hmplotDiagnostics()") == []

def test_headless_html_export_embeds_a_snapshot(session):
    # TODO 54: hm.export_html draws the scene in the export browser and shows its snapshot first.
    with hm.Scene() as scene:
        hm.Title("Snapshot title")
        with hm.Plot(height=200, axes2d=True):
            hm.Line(x=[0.0, 1.0], y=[0.0, 1.0])
    page = session.html(scene)
    assert b'<div id="hmplot-snapshot" role="img" aria-label="Snapshot title"><svg' in page
    assert b">Snapshot title</text>" in page
    # The plot fills the page's content (TODO 132.5), drawn at its maximum width (132.6).
    assert re.search(rb'<div id="hmplot-snapshot"[^>]*><svg [^>]*width="960"', page)
    # A page wider than the export window widens it, so its snapshot is drawn at its width.
    assert re.search(rb'<div id="hmplot-snapshot"[^>]*><svg [^>]*width="1400"', session.html(scene, page={"max_width": 1400}))
    assert session.last_report["snapshot"]["kind"] == "svg" and session.last_report["snapshot"]["bytes"] > 1000
    assert b'<img src="data:image/png;base64,' in session.html(scene, snapshot="png")
    bare = session.html(scene, snapshot=False)
    # (The inlined runtime's source holds the snapshot markup's template, not this.)
    assert b'<body><div id="hmplot-snapshot"' not in bare and session.last_report["snapshot"] is None
    with pytest.raises(ValueError, match='HTML export snapshot must be "svg", "png" or False'):
        session.html(scene, snapshot="jpeg")
    # A target without an export of its own (a Theme here; Data, a Row) snapshots the parts
    # inside it, and only those ("n.handle.exportSVG is not a function" before).
    with hm.Scene():
        with hm.Theme(value=hm.create_theme(colormap="Magma")) as theme:
            with hm.Plot(height=200, axes2d=True, title="Themed"):
                hm.Line(x=[0.0, 1.0], y=[0.0, 1.0])
        with hm.Plot(height=200, axes2d=True, title="Outside"):
            hm.Line(x=[0.0, 1.0], y=[1.0, 0.0])
    snapshot = re.search(rb'<div id="hmplot-snapshot".*?<span id="hmplot-label"', session.html(theme), re.S).group(0)
    assert b">Themed</text>" in snapshot and b"Outside" not in snapshot
    # TODO 133.1: the page's Plot keeps its own legend setting. The marks' group default (each
    # mark's entry, true) was written as the Plot's legend, so the live page added an automatic
    # legend that the PNG export and the snapshot did not have.
    def exported_legend(**legend):
        data = {"region": ["N", "S"], "product": ["A", "B"], "v": [1.0, 2.0]}
        with hm.Plot(data=data, height=200, **legend) as plot:
            bars = hm.charts.Bar(x="region", y="v", fill="product")
            hm.Legend(target=bars, channel="fill", label="Product")
        page = session.html(plot).decode("utf-8")
        state = json.loads(re.search(r'<script id="hmplot-state" type="application/json">(.*?)</script>', page, re.S).group(1))
        return state["state"]["root"]["children"][0]["props"].get("legend", False)
    assert exported_legend() is False
    assert exported_legend(legend=True) is True
    assert exported_legend(legend={"position": "right"}) == {"position": "right"}


def test_exported_controls_keep_shared_styles_and_theme_at_dpr2(session, tmp_path):
    with hm.Theme(value=hm.create_theme(extends="hmplot", controls={"accentColor": "#0f766e", "fontSize": 18})) as scene:
        hm.Playback(name="time", min=0, max=10, value=2, label="Time")
        with hm.Plot(height=200, title="Styled controls"):
            hm.Points(x=[0, 1], y=[0, 1])
    path = tmp_path / "controls.html"
    session.html(scene, path)
    page = session.browser.new_page()
    try:
        page.call("Emulation.setDeviceMetricsOverride", {"width": 900, "height": 600, "deviceScaleFactor": 2, "mobile": False})
        page.goto(path.as_uri())
        page.wait_for("!document.getElementById('hmplot-snapshot') && document.querySelector('.hm-playback')")
        style = page.evaluate("""() => {
          const control = document.querySelector('.hm-playback');
          const css = getComputedStyle(control), button = getComputedStyle(control.querySelector('button'));
          return { display: css.display, size: css.fontSize, gap: css.gap,
            accent: css.accentColor, font: css.fontFamily, buttonSize: button.fontSize,
            border: button.borderRadius, styles: document.querySelectorAll('style[id^="hmplot-css-"]').length };
        }""")
        assert style == {"display": "flex", "size": "18px", "gap": "5.4px",
                         "accent": "rgb(15, 118, 110)", "font": '"Source Sans 3", system-ui, -apple-system, sans-serif',
                         "buttonSize": "18px", "border": "6.3px", "styles": 1}
    finally:
        page.close()


def test_a_page_exported_from_python_goes_live_from_disk_and_keeps_its_snapshot_without_webgpu(session, tmp_path):
    # Opened from disk, nothing routed: the page runs the built standalone runtime it embeds (it
    # embedded src/lib/scene/standalone.js's unbuilt source, whose module cannot load, so every
    # page kept its snapshot), and exports itself again with it. The GeoJSON prepares in an
    # inlined worker: as a module worker from a blob URL it failed on the page's opaque origin,
    # and the page kept its snapshot (TODO 133.4).
    square = {"type": "Polygon", "coordinates": [[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]]]}
    with hm.Scene() as scene:
        with hm.Plot(height=200, axes2d=True):
            hm.Line(x=[0.0, 1.0], y=[0.0, 1.0])
            hm.GeoJSON(data=square, fill="#4c78a8")
    path = tmp_path / "page.html"
    page = session.html(scene, path)
    bundle = (Path(hm.__file__).with_name("static") / "standalone.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    runtime = f'<script type="module" id="hmplot-runtime">{bundle}{exporter._PAGE_CODE}'
    assert page.decode("utf-8").count(runtime) == 1

    def opened(*setup):
        tab = session.browser.new_page()
        errors = "window.__errors=[];addEventListener('error',(e)=>__errors.push(e.message));" \
                 "addEventListener('unhandledrejection',(e)=>__errors.push(String(e.reason?.message??e.reason)));"
        tab.call("Page.addScriptToEvaluateOnNewDocument", {"source": errors + "".join(setup)})
        tab.goto(path.as_uri())
        return tab

    live = opened()
    try:
        try:
            live.wait_for("!document.getElementById('hmplot-snapshot') && document.querySelectorAll('#hmplot-root .canvas').length === 1"
                          " && document.querySelector('#hmplot-root .canvas').getAttribute('aria-busy') === 'false'")
        except RuntimeError as error:
            raise AssertionError(f"{error} Page errors: {live.evaluate('() => __errors')}") from None
        assert live.evaluate("() => [document.getElementById('hmplot-status').textContent, !!document.getElementById('hmplot-label'),"
                             " document.getElementById('hmplot-root').className, __errors]") == ["Interactive plot", False, "", []]
        again = live.evaluate("() => hmplotExport('export_html', JSON.parse(document.getElementById('hmplot-state').textContent)"
                              ".state.root.id, { snapshot: false })")
        assert base64.b64decode(again["payload"]).decode("utf-8").count(runtime) == 1
    finally:
        live.close()
    plain = opened("Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined });")
    try:
        plain.wait_for("!document.getElementById('hmplot-root')")
        assert plain.evaluate("() => [document.getElementById('hmplot-label').textContent, document.getElementById('hmplot-status').textContent,"
                              " !!document.getElementById('hmplot-snapshot'), __errors]") == \
            ["Static · no WebGPU", "Static preview: this browser has no WebGPU", True, []]
    finally:
        plain.close()


def test_a_standalone_mark_page_shows_its_legend_and_tooltips(session, tmp_path):
    # TODO 129.1, as drawn: a standalone mark that maps a column shows the automatic legend, one
    # that maps nothing shows no strip, and hovering a point shows its tooltip unless the mark
    # sets tooltip=False.
    data = {"x": [0.0, 1.0, 2.0], "y": [0.0, 1.0, 2.0], "group": ["a", "b", "c"]}

    def page(name, **props):
        path = tmp_path / f"{name}.html"
        session.html(hm.Points(data=data, x="x", y="y", size=30, **props), path)
        tab = session.browser.new_page(width=700, height=600)
        tab.goto(path.as_uri())
        tab.wait_for("!document.getElementById('hmplot-snapshot') && document.querySelector('#hmplot-root .canvas')"
                     "?.getAttribute('aria-busy') === 'false'")
        return tab

    def hover_tooltip(tab):
        # The middle point, (1, 1): where the axes' "1" ticks are.
        x, y = tab.evaluate("""() => {
          const ticks = [...document.querySelectorAll('svg text')].filter((n) => n.textContent.trim() === '1')
            .map((n) => n.getBoundingClientRect());
          const below = ticks.reduce((a, b) => (b.y > a.y ? b : a)), left = ticks.reduce((a, b) => (b.x < a.x ? b : a));
          return [below.x + below.width / 2, left.y + left.height / 2];
        }""")
        for dx in (-6, 0):
            tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x + dx, "y": y})
        try:
            tab.wait_for("[...document.querySelectorAll('[role=tooltip]')].some((n) => n.getBoundingClientRect().width > 0"
                         " && n.textContent.trim())", timeout=3)
            return True
        except RuntimeError:
            return False

    strips = r"() => [...document.querySelectorAll('[data-guide-position]')].map((n) => n.textContent.replace(/\s+/g, ''))"
    tab = page("mapped", fill="group")
    try:
        assert tab.evaluate(strips) == ["groupabc"]
        assert hover_tooltip(tab)
    finally:
        tab.close()
    tab = page("plain")
    try:
        assert tab.evaluate(strips) == []
    finally:
        tab.close()
    tab = page("quiet", tooltip=False)
    try:
        assert not hover_tooltip(tab)
    finally:
        tab.close()


def test_a_facet_around_marks_draws_as_its_written_out_form(session):
    # TODO 129.2: the shorthand Facet(marks) exports exactly as Facet(Plot(marks)).
    data = {"g": ["a"] * 4 + ["b"] * 4, "x": [1.0, 2.0, 2.5, 3.0, 1.5, 3.5, 4.0, 4.2]}
    with hm.Facet(data=data, column="g") as shorthand:
        hm.charts.Histogram(x="x")
    with hm.Facet(data=data, column="g") as written:
        with hm.Plot():
            hm.charts.Histogram(x="x")
    assert session.png(shorthand, scale=1) == session.png(written, scale=1)


def test_a_themed_title_block_exports_as_it_is_laid_out(session):
    # TODO 132.1: theme.title aligns and sizes the title, subtitle and caption; the vector export
    # writes them where the page laid them out.
    import xml.etree.ElementTree as ET
    theme = hm.create_theme(title={"align": "center", "font_size": 24, "font_weight": 700, "subtitle_font_size": 15})
    with hm.Scene(theme=theme):
        with hm.Plot(height=200, width=600, axes2d=True, title="Centered", subtitle="A subtitle",
                     caption="A caption") as plot:
            hm.Line(x=[0.0, 1.0], y=[0.0, 1.0])
    svg = ET.fromstring(session.svg(plot, mode="vector"))
    texts = {node.text: node for node in svg.iter("{http://www.w3.org/2000/svg}text") if node.text}
    width = float(svg.attrib["width"].rstrip("px"))
    style = lambda node: dict(part.split(":", 1) for part in node.attrib.get("style", "").replace(" ", "").split(";") if ":" in part)
    for name in ("Centered", "A subtitle", "A caption"):
        node = texts[name]
        anchor, x = node.attrib.get("text-anchor", "start"), float(node.attrib["x"])
        # A centered line starts left of the middle by about half its width, or is anchored there.
        assert (anchor == "middle" and abs(x - width / 2) < 20) or (anchor == "start" and 0.2 * width < x < width / 2), (name, anchor, x)
    assert style(texts["Centered"]).get("font-size", texts["Centered"].attrib.get("font-size", "")).startswith("24")
    assert "700" in (style(texts["Centered"]).get("font-weight", "") + texts["Centered"].attrib.get("font-weight", ""))


def test_a_themed_number_format_labels_ticks_below_an_axis_format(session):
    # TODO 132.4: theme.numbers.format labels the ticks; an axis's own format wins.
    import xml.etree.ElementTree as ET
    theme = hm.create_theme(numbers={"format": "$,.0f"})
    with hm.Scene(theme=theme):
        with hm.Plot(height=200, width=600, axes2d=True, y={"format": ".1f"}) as plot:
            hm.Line(x=[0.0, 20000.0], y=[0.0, 1.0])
    texts = [node.text for node in ET.fromstring(session.svg(plot, mode="vector")).iter("{http://www.w3.org/2000/svg}text") if node.text]
    assert "$10,000" in texts and "0.5" in texts, texts


def test_a_brushed_histogram_filters_another_view(session, tmp_path):
    # Eval 2026-10-13: agents brush histograms in crossfilters (Histogram had no brush). A
    # Shift-drag across one histogram selects the rows in that interval of its binned column,
    # and a Filter(where="@brushed") elsewhere draws them.
    rng = np.random.default_rng(3)
    data = {"delay": rng.normal(15, 10, 4000), "distance": rng.uniform(100, 4000, 4000)}
    brush = hm.selection()
    with hm.Scene() as scene:
        with hm.Data(data), hm.Interaction(columns={"@delay_brush": brush}):
            with hm.Plot(height=220, width=500, axes2d=True, name="delays") as delays:
                hm.charts.Histogram(x="delay", bins=30, brush={"selection": brush}, respond=brush)
            with hm.Plot(height=220, width=500, axes2d=True, name="distances") as distances:
                with hm.Filter(where="@delay_brush", inactive="all"):
                    hm.charts.Histogram(x="distance", bins=30)
    assert hm.check(delays).plots[0]["model"]["marks"][0]["rows"] == 30, "the brush's helper part is not described"
    path = tmp_path / "crossfilter.html"
    session.html(scene, path)
    tab = session.browser.new_page(width=700, height=700)
    try:
        tab.call("Emulation.setDeviceMetricsOverride", {"width": 700, "height": 700, "deviceScaleFactor": 2, "mobile": False})
        tab.goto(path.as_uri())
        tab.wait_for("!document.getElementById('hmplot-snapshot') && document.querySelectorAll('.canvas').length === 2"
                     " && [...document.querySelectorAll('.canvas')].every((c) => c.getAttribute('aria-busy') === 'false')")
        export = (f"() => hmplotExport('export_png', {json.dumps(distances.id)}, {{ scale: 1 }})"
                  ".then((r) => r.payload)")
        before = tab.evaluate(export)
        box = tab.evaluate("() => { const r = document.querySelector('.canvas').getBoundingClientRect();"
                           " return [r.x, r.y, r.width, r.height]; }")
        x0, y = box[0] + box[2] * 0.25, box[1] + box[3] * 0.5
        mouse = lambda kind, x, **extra: tab.call("Input.dispatchMouseEvent", {
            "type": kind, "x": x, "y": y, "modifiers": 8, "button": "left", **extra})
        mouse("mouseMoved", x0)
        mouse("mousePressed", x0, clickCount=1)
        for step in range(1, 9):
            mouse("mouseMoved", x0 + box[2] * 0.2 * step / 8, buttons=1)
        mouse("mouseReleased", x0 + box[2] * 0.2, clickCount=1)
        tab.wait_for("document.querySelector('.brush-region') && [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false')")
        after = tab.evaluate(export)
        assert after != before, "the distance histogram redrew for the brushed rows"
        from PIL import Image
        rgb = np.asarray(Image.open(io.BytesIO(base64.b64decode(after))).convert("RGB"), dtype=int)
        assert ((rgb[..., 2] > rgb[..., 0] + 40) & (rgb[..., 1] > rgb[..., 0] + 15)).sum() > 100, \
            "linked bins must remain drawn; clearing the histogram is not successful brushing"
    finally:
        tab.close()


def test_geojson_lines_take_a_width_per_feature(session):
    # Eval 2026-10-13 (map-tiles): width="kind" on a GeoJSON of streets freed a gathered width
    # twice ("Referenced tracer ... freed") and the whole map failed to draw.
    line = lambda kind, y: {"type": "Feature", "properties": {"kind": kind},
                            "geometry": {"type": "LineString", "coordinates": [[0, y], [10, y]]}}
    streets = {"type": "FeatureCollection", "features": [line("street", 1), line("arterial", 2), line("street", 3)]}
    with hm.Plot(coordinates="spherical", projection="mercator", height=200) as plot:
        hm.GeoJSON(data=streets, color="kind", width="kind",
                   width_scale=hm.categorical(domain=["street", "arterial"], range=[0.5, 3]), legend=False)
    result = hm.check(plot, session=session, vector=False)
    assert result.ok, result.errors


def test_exports_find_chrome_by_env_first_and_draw_on_swiftshader_without_a_gpu(monkeypatch, tmp_path):
    # R2.0c: HMPLOT_CHROME comes first, and must be a file.
    monkeypatch.setenv("HMPLOT_CHROME", str(tmp_path / "nope"))
    with pytest.raises(RuntimeError, match="HMPLOT_CHROME is .*, which is not a file"):
        chrome.find_chrome()
    monkeypatch.delenv("HMPLOT_CHROME")
    try:
        chrome.find_chrome(download=False)
    except RuntimeError as error:
        pytest.skip(str(error))
    # Without a GPU (servers, CI), Chrome's software adapter draws the same plots.
    original = chrome.Browser.__init__
    monkeypatch.setattr(chrome.Browser, "__init__", lambda self, executable=None, *, swiftshader=False:
                        original(self, executable, swiftshader=True))
    _, plot = plot_scene()
    with exporter.ExportSession() as session:
        assert session.png(plot)[:4] == b"\x89PNG" and session.browser.swiftshader
        assert "swiftshader" in session.browser.adapter


def test_chrome_waits_out_its_busy_port_file_and_profile(monkeypatch, tmp_path):
    # CI 2026-10-02: on Windows Chrome still held DevToolsActivePort open (PermissionError); on
    # Linux it still wrote into its profile as the export's cleanup deleted it ("Directory not
    # empty"), which hid the export's own error. Both are retried, and the cleanup never raises.
    import tempfile

    browser = object.__new__(chrome.Browser)
    browser.profile = tempfile.TemporaryDirectory(dir=tmp_path)
    browser.process = type("Running", (), {"poll": lambda self: None})()
    (Path(browser.profile.name) / "DevToolsActivePort").write_text("41234\n/devtools/browser/abc\n")
    read_text, busy = Path.read_text, iter([PermissionError(13, "Permission denied"), ""])

    def held(path, *args, **kwargs):
        result = next(busy, None)
        if isinstance(result, Exception):
            raise result
        return read_text(path, *args, **kwargs) if result is None else result
    monkeypatch.setattr(Path, "read_text", held)
    assert browser._endpoint(timeout=5) == (41234, "/devtools/browser/abc")

    cleanup, writing = browser.profile.cleanup, [OSError(39, "Directory not empty")] * 2

    def still_writing():
        if writing:
            raise writing.pop()
        cleanup()
    monkeypatch.setattr(browser.profile, "cleanup", still_writing)
    chrome._remove_profile(browser.profile)
    assert not Path(browser.profile.name).exists()
    writing[:] = [OSError(39, "Directory not empty")] * 1000
    chrome._remove_profile(browser.profile, timeout=0.2)  # gives up quietly


@pytest.mark.skipif(sys.platform == "win32", reason="a shell script stands in for Chrome")
def test_chrome_without_a_usable_sandbox_says_what_to_do_and_goes_unsandboxed_only_on_request(monkeypatch, tmp_path):
    # Chrome for Testing on Ubuntu 24.04 (AppArmor restricts unprivileged user namespaces) quits
    # with "No usable sandbox!". hmplot never turns the sandbox off by itself (only as root):
    # the error names the fixes, and HMPLOT_CHROME_NO_SANDBOX=1 opts in.
    fake = tmp_path / "chrome"
    fake.write_text('#!/bin/sh\ncase "$*" in *--no-sandbox*) echo "started unsandboxed" >&2; exit 3;; esac\n'
                    'echo "[1:1:FATAL:zygote_host_impl_linux.cc(128)] No usable sandbox! If you are running on Ubuntu 23.10+ ..." >&2\nexit 1\n')
    fake.chmod(0o755)
    monkeypatch.delenv(chrome.ENV_NO_SANDBOX, raising=False)
    monkeypatch.setattr(chrome.os, "geteuid", lambda: 1000, raising=False)
    with pytest.raises(RuntimeError) as failed:
        chrome.Browser(fake)
    assert all(text in str(failed.value) for text in ("No usable sandbox!", "Install Google Chrome", "HMPLOT_CHROME_NO_SANDBOX=1"))
    monkeypatch.setenv(chrome.ENV_NO_SANDBOX, "1")
    with pytest.raises(RuntimeError, match="exited at launch: started unsandboxed"):
        chrome.Browser(fake)


def test_the_export_server_answers_only_under_its_session_token():
    # The export page and runtime are served on 127.0.0.1 under a random path: a local user or
    # process that finds the port gets 404s.
    import urllib.error
    import urllib.request

    fetch = urllib.request.build_opener(urllib.request.ProxyHandler({})).open
    with exporter._Assets() as assets, exporter._Assets() as other:
        assert assets.url.endswith(f"/{assets.token}/") and len(assets.token) >= 32 and other.token != assets.token
        assert b'src="standalone.js"' in fetch(assets.url).read()
        assert fetch(assets.url + "standalone.js").read() == assets.bundle.read_bytes()
        server = assets.url.removesuffix(f"{assets.token}/")
        for path in ("", "standalone.js", f"{other.token}/", f"{assets.token}/x"):
            with pytest.raises(urllib.error.HTTPError, match="404"):
                fetch(server + path)


@pytest.mark.skipif(sys.platform != "darwin", reason="--disable-gpu reproduces a GPU-less runner's failure in Chrome on macOS")
def test_exports_need_webgpu_that_draws_and_say_why_not(monkeypatch):
    # CI 2026-10-02: on a Linux runner without a GPU, Chrome found a WebGPU adapter, but the first
    # frame a canvas showed lost the device, and every export failed with "A valid external
    # Instance reference no longer exists". Chrome on macOS with --disable-gpu fails the same way.
    # A setup now counts only once a canvas has drawn in it, and the error says how each failed.
    try:
        chrome.find_chrome(download=False)
    except RuntimeError as error:
        pytest.skip(str(error))
    popen = chrome.subprocess.Popen
    monkeypatch.setattr(chrome.subprocess, "Popen", lambda args, *rest, **options:
                        popen([*args[:-1], "--disable-gpu", args[-1]], *rest, **options))
    with exporter._Assets() as assets:
        with pytest.raises(RuntimeError, match="no WebGPU adapter that draws") as failed:
            chrome.open_page(assets.url, "typeof hmplotStandalone === 'function'")
        message = str(failed.value)
        assert "SwiftShader: the device was lost: A valid external Instance reference no longer exists" in message
        assert "--use-webgpu-adapter=swiftshader" in message and "CompoundImageBacking" in message
        # An export that loses its device later says which setup it ran on.
        browser = chrome.Browser(swiftshader=True)
        try:
            page = browser.new_page()
            page.goto(assets.url)
            with pytest.raises(RuntimeError, match=r"(?s)Device was destroyed\..*WebGPU on SwiftShader.*flags: .*--use-webgpu-adapter=swiftshader"):
                page.evaluate("() => { throw Error('WebGPU device lost: Device was destroyed.'); }")
        finally:
            browser.close()
        assert not Path(browser.profile.name).exists()


@pytest.mark.skipif(not os.environ.get("HMPLOT_TEST_DOWNLOAD"), reason="downloads Chrome for Testing (set HMPLOT_TEST_DOWNLOAD=1)")
def test_first_export_downloads_chrome_for_testing_into_the_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(chrome, "cache_dir", lambda: tmp_path)
    monkeypatch.setattr(chrome, "_installed", lambda: [])
    monkeypatch.delenv("HMPLOT_CHROME", raising=False)
    monkeypatch.delenv("HMPLOT_NO_DOWNLOAD", raising=False)
    _, plot = plot_scene()
    assert hm.export_png(plot)[:4] == b"\x89PNG"
    assert chrome._cached() is not None and chrome._cached().is_relative_to(tmp_path)


def test_html_export_without_a_browser_warns_and_has_no_snapshot(monkeypatch):
    monkeypatch.setenv("HMPLOT_NO_DOWNLOAD", "1")
    monkeypatch.setattr(chrome, "_installed", lambda: [])
    monkeypatch.setattr(chrome, "_cached", lambda: None)
    monkeypatch.delenv("HMPLOT_CHROME", raising=False)
    with hm.Scene() as scene:
        with hm.Plot():
            hm.Line(x=[0.0, 1.0], y=[0.0, 1.0])
    with pytest.warns(RuntimeWarning, match=r"HTML export without a snapshot: .*found none.*HMPLOT_NO_DOWNLOAD is set"):
        page = hm.export_html(scene)
    assert b'<body><div id="hmplot-snapshot"' not in page and b'<html lang="en">' in page


def test_html_pages_built_without_the_browser_keep_an_identity_s_keys(session, monkeypatch):
    """TODO 69.1 (CODEX_REVIEW #2): the page Python builds itself (snapshot=False, or no browser)
    keeps the key column of an identity no mark reads, and its scene loads with keyed selection."""
    import re

    rows = hm.identity(keys=["first", "second"])
    with hm.Scene() as scene:
        with hm.Plot(height=120):
            hm.Points(position=[[0, 0], [1, 1]], identity=rows, select=True)

    def embedded(page):
        return json.loads(re.search(rb'<script id="hmplot-state" type="application/json">(.*?)</script>', page, re.S).group(1))

    payload = embedded(hm.export_html(scene, snapshot=False))
    key = payload["state"]["identities"][rows.id]["keys"]["$column"]
    assert key in payload["state"]["columns"] and key in payload["columns"]
    monkeypatch.setenv("HMPLOT_NO_DOWNLOAD", "1")
    monkeypatch.setattr(chrome, "_installed", lambda: [])
    monkeypatch.setattr(chrome, "_cached", lambda: None)
    monkeypatch.delenv("HMPLOT_CHROME", raising=False)
    with pytest.warns(RuntimeWarning, match="HTML export without a snapshot"):
        fallback = embedded(hm.export_html(scene))
    assert key in fallback["columns"]
    # The page's scene, loaded as the page loads it: the identity selects by its keys' rows.
    session.page.evaluate("payload => hmplotStandalone(payload)", payload)
    session._mounted = None
    selection = payload["state"]["identities"][rows.id]["selection"]["$selection"]
    result = session._command("selection", selection, {"owner": rows.id, "operation": "replace", "rows": [1]})["value"]
    assert result["owners"] == {rows.id: [1]}


def test_export_session_serves_columns_and_brings_results_back_in_slices(session, monkeypatch):
    # Ten million rows were more than one DevTools message holds (about 100 MB): the session
    # serves the columns' bytes from its own server, and an export's result comes in slices.
    plot = hm.Plot(hm.Points(data={"x": np.arange(5000.0), "y": np.arange(5000.0) % 7}, x="x", y="y"))
    sent = []
    evaluate = session.page.evaluate
    monkeypatch.setattr(session.page, "evaluate", lambda function, arg=None: (sent.append(arg), evaluate(function, arg))[1])
    monkeypatch.setattr(exporter, "_RESULT_SLICE", 50_000)
    session._mounted = None
    whole = session.png(plot, scale=1)
    mounted = [arg for arg in sent if isinstance(arg, dict) and "columns" in arg]
    assert mounted and all("url" in column and "payload" not in column for column in mounted[0]["columns"].values())
    assert sum(isinstance(arg, list) for arg in sent) > 1
    assert whole.startswith(b"\x89PNG") and len(whole) > 50_000 * 3 // 4


def test_faceted_time_series_filtered_by_a_brush_elsewhere_draws(session):
    # A Facet's cells over a datetime column, under a Filter of a brush another plot owns: the
    # cells' domain preparation bound the time axis on a read-only snapshot and threw "Points:
    # e.set is not a function" (the complex eval's sensor wall).
    import pandas as pd
    n = 96
    frame = pd.DataFrame({"time": pd.date_range("2024-01-01", periods=n, freq="h").astype("datetime64[ms]"),
                          "temp": np.sin(np.arange(n) / 5), "region": np.repeat(["A", "B"], n // 2),
                          "outlier": (np.arange(n) % 10 == 0).astype(int)})
    with hm.Scene() as scene:
        with hm.Data(hm.Table(frame)):
            with hm.Facet(row="region"):
                with hm.Plot(height=110):
                    with hm.Filter(where="@brushed"):
                        hm.Line(x="time", y="temp")
                        with hm.Filter(where=hm.col.outlier == 1):
                            hm.Points(x="time", y="temp", size=4)
            with hm.Plot(height=150):
                hm.Points(x="time", y="temp", size=3, brush={"axis": "x"})
    assert hm.check(scene, session=session).errors == []


def test_a_flat_map_frames_its_geojson_and_its_explicit_domain(session):
    # A city's districts on a Mercator map were a speck in a world view (TODO 134.24, 135.4):
    # GeoJSON fits the view to its features, and an explicit lon/lat domain frames it too.
    import io
    from PIL import Image
    square = {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [[
        [-9.2, 38.6], [-9.1, 38.6], [-9.1, 38.7], [-9.2, 38.7], [-9.2, 38.6]]]}}
    def filled(plot):
        image = Image.open(io.BytesIO(session.png(plot, scale=1))).convert("RGB")
        return sum(1 for r, g, b in image.getdata() if r < 60 and g > 120 and b < 60) / (image.width * image.height)
    with hm.Plot(coordinates="spherical", projection="mercator", width=400, height=300) as fitted:
        hm.GeoJSON(data=square, fill="#20a020")
    assert filled(fitted) > 0.2
    with hm.Plot(coordinates="spherical", projection="mercator", width=400, height=300) as world:
        hm.GeoJSON(data=square, fill="#20a020", fit=False)
    assert filled(world) < 0.01
    with hm.Plot(data={"lon": [-9.2, -9.1, -9.1, -9.2], "lat": [38.6, 38.6, 38.7, 38.7]}, coordinates="spherical",
                 projection="mercator", width=400, height=300, x={"domain": [-9.25, -9.05]}, y={"domain": [38.55, 38.75]}) as framed:
        hm.Polygon(x="lon", y="lat", fill="#20a020")
    assert filled(framed) > 0.08


def test_line_series_on_a_log_axis_end_at_their_last_points(session):
    # The NaN row that ends a series became the 1e20 sentinel on a log axis, and every series end
    # drew a line toward the far corner (the complex eval's wealth-health trails; TODO 135.8).
    import io
    from PIL import Image
    data = {"x": [10, 100, 1000, 20, 200, 2000], "y": [1, 2, 3, 1.5, 2.5, 2.0], "s": ["a"] * 3 + ["b"] * 3}
    with hm.Plot(data=data, width=400, height=300, axes2d=True, x={"transform": "log"}, y={"domain": [0, 10]}) as plot:
        hm.Line(x="x", y="y", series="s", color="#ff0000", width=3)
    image = Image.open(io.BytesIO(session.png(plot, scale=1))).convert("RGB")
    red = lambda box: sum(1 for r, g, b in image.crop(box).getdata() if r > 200 and g < 80 and b < 80)
    assert red((0, 0, image.width, image.height // 2)) == 0
    assert red((0, image.height // 2, image.width, image.height)) > 500


def test_headless_mp4_on_a_mark_and_a_scene_restores_the_clock(session, tmp_path):
    mark = hm.Points(data={"x": [0.0, 1.0], "y": [0.0, 1.0]}, x="x",
                            y=hm.col.y + hm.sin(hm.view.time / 100))
    assert session.set_time(mark, 123, freeze=True) == 123
    previous = session._clock(mark)
    assert session.mp4(mark, tmp_path / "mark.mp4", duration=200, fps=10).stat().st_size > 0
    after = session._clock(mark)
    # Not stuck on the last frame (100 ms): back at the saved time and frozen state.
    assert after["frozen"] == previous["frozen"] and after["time"] >= 123
    if previous["frozen"]:
        assert after["time"] == 123
    scene, _ = plot_scene()
    assert session.mp4(scene, tmp_path / "scene.mp4", duration=100, fps=10).stat().st_size > 0
    # R2.0c.3: encoded in the browser by WebCodecs, a file ffmpeg reads back frame by frame.
    import imageio_ffmpeg
    assert session.set_time(mark, 50, freeze=True) == 50
    browser = session.mp4(mark, tmp_path / "browser.mp4", duration=300, fps=10, encoder="browser")
    assert imageio_ffmpeg.count_frames_and_secs(str(browser)) == (3, 0.3)
    assert session._clock(mark) == {"time": 50, "frozen": True}


def test_headless_clock_steps_a_playing_playback(session):
    # TODO 50: a Scene is one clock. Stepping it (as export_mp4 does each frame) moves a playing
    # Playback by the step; frozen, it stands still between steps. The Playback plays until the
    # first set_time freezes it, and mounting took up to 43 s on SwiftShader on a CI runner
    # (2026-10-02): the rows go on to 200 s, so the step still shows more of them.
    # Isolate the clock's data pixels from the default guides' GPU edge dithering.
    rows = {"t": [i / 2 for i in range(400)], "y": [0.0] * 400}
    with hm.Scene() as scene:
        hm.Playback(name="p", min=0, max=1000, rate=1, playing=True)
        with hm.Data(rows):
            with hm.Filter(where=hm.col.t < hm.input.p):
                with hm.Plot(width=240, height=80, axes2d=False,
                             x={"domain": [-1, 200]}, y={"domain": [-1, 1]}) as plot:
                    hm.Points(x="t", y="y", size=8, fill="#2468a0")
    assert session.set_time(scene, 0) == 0
    first = session.png(plot, scale=1)
    session.set_time(scene, 0)
    again = session.png(plot, scale=1)
    assert session.set_time(scene, 3000) == 3000
    later = session.png(plot, scale=1)
    assert first == again and later != first


def test_calendar_functions_and_datetimes_serialize():
    # TODO 53.1: calendar functions carry their options; Python times reach the browser as epoch ms.
    import datetime
    assert hm.month_name(hm.col.t, tz="Europe/Paris").args[1] == {"$expression_options": {"tz": "Europe/Paris"}}
    assert hm.year("t").args[1] == {"$expression_options": {}}
    assert hm.time_floor("t", "1 month").args[1] == {"$expression_options": {"interval": "1 month"}}
    with pytest.raises(ValueError, match="interval such as"):
        hm.time_floor("t", "1 fortnight")
    with pytest.raises(ValueError, match="unknown time zone"):
        hm.day("t", tz="Mars/Olympus")
    with hm.Scene() as scene:
        with hm.Data({"t": np.array(["2026-01-01", "2026-02-01"], dtype="datetime64[ms]")}):
            with hm.Filter(where=hm.time_floor("t", "1 month") < datetime.datetime(2026, 1, 15, tzinfo=datetime.timezone.utc)):
                hm.Plot()
    state, _ = scene._snapshot()
    where = state["root"]["children"][0]["children"][0]["props"]["where"]["$expression"]
    assert where["args"][1] == {"$datetime": 1768435200000}
    assert where["args"][0]["$expression"]["op"] == "time_floor"
    # A time input's value comes back as an aware datetime in its zone, on the node and to on_change.
    with hm.Scene() as scene:
        slider = hm.Slider(name="day", min=datetime.date(2026, 1, 1), max=datetime.date(2026, 2, 1), step="1 day")
    changes = []
    slider.on_change(lambda event: changes.append(event.value))
    scene._views["v"] = {"ready": True}
    scene._receive({"type": "input", "scene": scene.id, "view": "v", "revision": scene.revision, "target": slider.id,
                    "sequence": 1, "value": {"$datetime": 1768435200000, "timezone": "America/New_York"}}, [])
    value = slider.props["value"]
    assert changes == [value] and value.isoformat() == "2026-01-14T19:00:00-05:00"
    assert str(value.tzinfo) == "America/New_York"
    props = scene._snapshot()[0]["root"]["children"][0]["props"]
    assert (props["min"], props["value"]) == ({"$datetime": 1767225600000}, {"$datetime": 1768435200000})


def test_time_in_transforms_interval_floor_and_round_serialize():
    # TODO 28: @time is readable in Filter conditions and Calculate columns; interval() steps it.
    stepped = hm.interval(hm.view.time, 500)
    assert stepped.op == "interval" and stepped.args[1] == {"$expression_options": {"period": 500}}
    for bad in (0, -5, float("inf"), float("nan"), "500", True, None):
        with pytest.raises(TypeError, match=r"interval\(\) needs a period in milliseconds"):
            hm.interval(hm.view.time, bad)
    assert hm.floor(hm.col.x / 2).op == "floor" and hm.round(hm.col.x).op == "round"
    with hm.Scene() as scene:
        with hm.Data({"t": [0.0, 100.0], "y": [1.0, 2.0]}):
            with hm.Plot():
                with hm.Filter(where=hm.col.t < stepped):
                    with hm.Calculate(age=hm.view.time - hm.col.t, second=hm.floor(hm.view.time / 1000)):
                        hm.Points(x="t", y="age")
    state, _ = scene._snapshot()
    plot = state["root"]["children"][0]["children"][0]
    where = plot["children"][0]["props"]["where"]["$expression"]
    assert where["op"] == "less"
    assert where["args"][1] == {"$expression": {"op": "interval", "args": [
        {"$expression": {"op": "state", "args": ["time"]}}, {"$expression_options": {"period": 500}}]}}
    columns = plot["children"][0]["children"][0]["props"]["columns"]
    assert columns["second"]["$expression"]["op"] == "floor"


def test_ordered_heatmap_recipe_labels_strip_and_export_pixels(session):
    import runpy
    import xml.etree.ElementTree as ET
    from PIL import Image

    ns = runpy.run_path(str(Path(__file__).resolve().parents[2] / "src/recipes/26_ordered_heatmap.py"))
    matrix, order = ns["matrix"], ns["order"]
    np.testing.assert_array_equal(matrix, np.sin(np.arange(40)[:, None] + np.arange(4)) * 2)
    np.testing.assert_array_equal(ns["ordered"], matrix[order])
    svg = ET.fromstring(session.svg(ns["chart"]))
    parents = {child: parent for parent in svg.iter() for child in parent}
    def point(element):
        x, y = float(element.get("x", 0)), float(element.get("y", 0))
        for parent in (element, *ancestors(element)):
            for dx, dy in re.findall(r"translate\(([\d.e+-]+)[ ,]+([\d.e+-]+)\)", parent.get("transform", "")):
                x += float(dx); y += float(dy)
        return x, y
    def ancestors(element):
        while element in parents:
            element = parents[element]
            yield element
    labels = {"".join(e.itertext()): e for e in svg.iter() if e.tag.endswith("}text")}
    ys = [point(labels[gene])[1] for gene in ns["genes"][order]]
    assert len(ys) == 40 and min(np.diff(ys)) > 18
    assert 10 < min(ys) < max(ys) < 940
    assert {"−2", "2", "Control", "Treated", "Expression (z score)"} <= labels.keys()
    pixels = np.asarray(Image.open(io.BytesIO(session.png(ns["chart"], scale=1))).convert("RGB"))
    gradient = next(e for e in svg.iter() if e.tag.endswith("}linearGradient"))
    stops = list(gradient)
    assert [(stops[i].get("offset"), stops[i].get("stop-color")) for i in (0, -1)] == [("0", "#67001f"), ("1", "#053162")]
    bar = next(e for e in svg.iter() if e.get("fill") == f"url(#{gradient.get('id')})")
    bx, by = point(bar)
    bx += float(bar.get("width")) / 2
    for y, color in [(by + 1, [5, 49, 98]), (by + float(bar.get("height")) - 2, [103, 0, 31])]:
        np.testing.assert_allclose(pixels[round(y), round(bx)], color, atol=12)
    xs = [round(point(labels[sample])[0]) for sample in ns["samples"]]
    strip_y = round(point(labels["Condition"])[1])
    for column, x in enumerate(xs):
        np.testing.assert_allclose(pixels[strip_y, x], [68, 119, 170] if column < 2 else [238, 102, 119], atol=2)
    # Every displayed cell agrees with an independent Rect rendering of the reordered values.
    with hm.Plot(height=960, x=ns["x"], y={"scale": hm.categorical(domain=["Condition", *ns["genes"][order]])}) as reference:
        row, column = np.indices((41, 4))
        rect = hm.Rect(x0=column.ravel()-.5, x1=column.ravel()+.5,
                       y0=row.ravel()-.5, y1=row.ravel()+.5,
                       fill=np.vstack([np.zeros((1, 4)), matrix[order]]).ravel(), fill_scale=ns["colors"])
        strip = hm.Rect(x0=[-.5,.5,1.5,2.5], x1=[.5,1.5,2.5,3.5], y0=-.5, y1=.5,
                       fill=["Control", "Control", "Treated", "Treated"], fill_scale=ns["conditions"])
        hm.Legend(target=rect, channel="fill", label="Expression (z score)")
        hm.Legend(target=strip, channel="fill", label="Condition")
    expected = np.asarray(Image.open(io.BytesIO(session.png(reference, scale=1))).convert("RGB"))
    for y in ys:
        for x in xs:
            np.testing.assert_allclose(pixels[round(y), x], expected[round(y), x], atol=3)


def test_marginals_recipe_uses_fitted_counts_and_readable_labels(session):
    import runpy
    from PIL import Image

    ns = runpy.run_path(str(Path(__file__).resolve().parents[2] / "src/recipes/25_marginals.py"))
    result = hm.check(ns["chart"], session=session, vector=False)
    assert result.ok and result.png and len(result.plots) == 1, result
    marks = result.plots[0]["model"]["marks"]
    assert sorted(mark["kind"] for mark in marks) == ["Histogram", "Histogram", "Points"]
    assert next(mark["rows"] for mark in marks if mark["kind"] == "Points") == 300
    svg = session.svg(ns["chart"]).decode()
    assert all(label in svg for label in ("Bill length (mm)", "Bill depth (mm)", "Adelie", "Chinstrap", "Gentoo"))
    pixels = np.asarray(Image.open(io.BytesIO(session.png(ns["chart"], scale=1))).convert("RGB"))
    blue = (pixels[..., 2].astype(int) > pixels[..., 0] + 40) & (pixels[..., 2].astype(int) > pixels[..., 1] + 20)
    # The top and right histograms have varied counts, rather than clipped solid rectangles.
    top = blue[:120].sum(axis=0)
    right = blue[140:400, -100:].sum(axis=1)
    assert len(np.unique(top[top > 0])) > 5 and len(np.unique(right[right > 0])) > 5



def test_check_reports_errors_inside_marginals_views(session):
    figure = hm.charts.Marginals(data={"x": [1., 2.], "y": [3., 4.]}, x="missing", y="y")
    result = hm.check(figure, session=session, vector=False)
    assert not result.ok and any("missing" in error for error in result.errors), result
