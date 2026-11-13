import asyncio
import json
import numpy as np
import pytest
import re
import hmplot as hm

def test_arrow_caps_and_chart_head_settings_round_trip():
    with hm.Plot() as plot:
        segments = hm.Segments(start=[[0, 0]], end=[[1, 1]], cap="arrow", head_length=14, head_width=9)
        arrows = hm.charts.Arrows(start=[[0, 0]], end=[[1, 1]], head_length=14, head_width=9)
        solid = hm.Arrows3D(start=[[0, 0, 0]], end=[[1, 1, 1]], lit=True)
    state, _ = plot._scene()._snapshot()
    nodes = {node["kind"]: node for node in _flatten_nodes(state["root"])
             if node["kind"] in ("Segments", "Arrows", "Arrows3D")}
    assert nodes["Segments"]["props"]["cap"] == "arrow"
    for kind in ("Segments", "Arrows"):
        assert nodes[kind]["props"]["headLength"] == 14
        assert nodes[kind]["props"]["headWidth"] == 9
    assert nodes["Arrows3D"]["props"]["lit"] is True
    arrows.update(head_length=18)
    segments.update(cap="bar")
    assert arrows.props["headLength"] == 18 and segments.props["cap"] == "bar"
    with pytest.raises(TypeError, match="use hm.Arrows3D for lit solid arrows"):
        hm.charts.Arrows(lit=True)

def test_outline_opacity_channel_and_removal_of_noop_outlines():
    with hm.Plot() as plot:
        rect = hm.Rect(x0=[0, 2], x1=[1, 3], y0=0, y1=1,
                       outline_width=[2, 4], outline_opacity=[1, 0])
    state, _ = plot._scene()._snapshot()
    node = next(n for n in _flatten_nodes(state["root"]) if n["kind"] == "Rect")
    assert "outlineOpacity" in node["props"]
    assert "outline_opacity" not in node["props"]
    import inspect
    for name in ["Text", "Callout", "ErrorBars", "Ecdf", "Smooth", "Prism", "Points3D"]:
        assert "outline_opacity" not in inspect.signature(getattr(hm.charts if name in hm.charts.__all__ else hm, name)).parameters
    with pytest.raises((TypeError, ValueError), match="outline"):
        hm.Text(text="label", outline_color="red")
    for alpha in [-1, 1.5, float("nan"), True]:
        with pytest.raises(ValueError, match="Rect.outline_opacity"):
            rect.update(outline_opacity=alpha)


def test_point_depth_write_boolean_round_trips_and_is_point_only():
    with hm.Plot(type="3d") as plot:
        flat = hm.Points(x=[0], y=[0], z=[1], depth_write=False)
        solid = hm.Points3D(x=[0], y=[0], z=[1], depth_write=True)
    def depths():
        state, _ = plot._scene()._snapshot()
        return {node["kind"]: node["props"]["depthWrite"]
                for node in _flatten_nodes(state["root"])
                if node["kind"] in ("Points", "Points3D")}
    assert depths() == {"Points": False, "Points3D": True}
    flat.update(depth_write=True)
    solid.update(depth_write=False)
    assert depths() == {"Points": True, "Points3D": False}
    with pytest.raises(TypeError, match="Line: unknown property 'depth_write'"):
        hm.Line(depth_write=False)


def test_row_count_data_serializes_without_uploaded_columns_and_validates_updates():
    with hm.Data(rows=1000000) as data:
        with hm.Plot():
            hm.Points(x=hm.row(), y=hm.random())
    state, buffers = data._scene()._snapshot()
    node = next(n for n in _flatten_nodes(state["root"]) if n["kind"] == "Data")
    assert node["props"] == {"rows": 1000000}
    points = next(n for n in _flatten_nodes(state["root"]) if n["kind"] == "Points")
    assert points["props"]["x"] == {"$expression": {"op": "row", "args": []}}
    assert not buffers and not state["tables"]
    data.update(rows=0)
    assert data.props["rows"] == 0
    for rows in [-1, 1.5, float("nan"), float("inf"), 2147483648, 10**100, 1j, True, np.bool_(False), "3", None]:
        with pytest.raises(ValueError, match=r"Data.rows must be an integer from 0 to 2147483647"):
            hm.Data(rows=rows)
        with pytest.raises(ValueError, match=r"Data.rows must be an integer"):
            data.update(rows=rows)
        assert data.props["rows"] == 0
    with pytest.raises(ValueError, match="pass a table or rows, not both"):
        hm.Data({"x": [1]}, rows=1)
    with pytest.raises(TypeError, match="Data requires a table or a row count"):
        hm.Data()
    with pytest.raises(AttributeError, match=r"Use hm.Data\(rows=N\)"):
        hm.ConstantData(rows=1)


def test_seeded_random_expressions_serialize_per_row_draws_and_scalar_seed_inputs():
    with hm.Scene() as scene:
        hm.Slider(name="seed", min=0, max=20, step=1, value=7)
        with hm.Data(rows=12):
            with hm.Calculate(columns={"uniform": hm.random(), "normal": hm.random(seed=np.uint32(7), distribution="normal"),
                                       "exponential": hm.random(seed=hm.input.seed + 1, distribution="exponential")}):
                with hm.Plot():
                    hm.Points(x="uniform", y="normal")
    state, buffers = scene._snapshot()
    calculate = next(node for node in _flatten_nodes(state["root"]) if node["kind"] == "Calculate")
    draws = calculate["props"]["columns"]
    assert draws["uniform"] == {"$expression": {"op": "random", "args": [0, {"$expression_options": {"distribution": "uniform"}}]}}
    assert draws["normal"]["$expression"]["args"] == [7, {"$expression_options": {"distribution": "normal"}}]
    assert draws["exponential"]["$expression"]["args"][0]["$expression"]["op"] == "add"
    assert not state["tables"] and not buffers
    for seed in [-1, 1.5, float("nan"), float("inf"), 4294967296, True, "7", None, 10**100]:
        with pytest.raises(ValueError, match=r"random\(\) seed must be an integer"):
            hm.random(seed=seed)
    for distribution in ["poisson", "", None, 3]:
        with pytest.raises(ValueError, match=r"random\(\) distribution"):
            hm.random(distribution=distribution)


def test_paired_galaxy_generates_ten_million_rows_without_uploads_or_oversized_expressions():
    import runpy
    from pathlib import Path
    program = Path(__file__).resolve().parents[2] / "src/examples/ten-million-stars/ten-million-stars.py"
    result = runpy.run_path(str(program))
    state, buffers = result["scene"]._snapshot()
    nodes = list(_flatten_nodes(state["root"]))
    assert next(node for node in nodes if node["kind"] == "Data")["props"] == {"rows": 10_000_000}
    assert not state["tables"] and not buffers
    assert len(json.dumps(state)) < 60_000, "scene configuration must not contain a downloaded stellar catalog"
    def operations(value):
        if isinstance(value, dict) and "$expression" in value:
            return 1 + sum(operations(arg) for arg in value["$expression"]["args"])
        return 0
    for node in nodes:
        if node["kind"] == "Calculate":
            assert all(operations(expression) <= 256 for expression in node["props"]["columns"].values())
    points = [node["props"] for node in nodes if node["kind"] == "Points"]
    assert len(points) == 2 and all(mark["shape"] == "square" for mark in points)
    assert points[0]["blend"] == "additive"


def test_vector_tile_detail_serializes_expressions_and_validates_updates():
    with hm.Scene() as scene:
        hm.Slider(name="detail", min=-2, max=2, value=0)
        with hm.Plot():
            tiles = hm.VectorTile(tile=[0, 0, 0], zoom_bias=1)
    assert tiles.props["zoomBias"] == 1
    scene._snapshot()
    tiles.update(zoom_bias=hm.input.detail)
    scene._snapshot()
    tiles.update(zoom_bias=-2)
    for value in [True, "1", float("nan"), float("inf"), -5, 5]:
        with pytest.raises(ValueError, match=r"VectorTile.zoom_bias.*finite number"):
            tiles.update(zoom_bias=value)
        assert tiles.props["zoomBias"] == -2


def test_frame_bounds_animation_serializes_independent_timing_and_updates():
    with hm.Plot() as plot:
        with hm.Frame(animate_bounds=True, bounds_duration=700, bounds_easing="linear") as frame:
            hm.Points(position=[[0, 0], [1, 1]])
    assert frame.props["animateBounds"] is True
    assert frame.props["boundsDuration"] == 700
    assert frame.props["boundsEasing"] == "linear"
    assert "animation" not in frame.props
    frame.update(animate_bounds=False, bounds_duration=0)
    assert frame.props["animateBounds"] is False
    plot._scene()._snapshot()


def test_context_and_rollback():
    with hm.Scene() as scene:
        with hm.Data({"x": [1, 2], "y": [3, 4]}):
            with hm.Plot() as plot:
                points = hm.Points(x="x", y="y")
    before = scene._snapshot()[0]
    with pytest.raises(RuntimeError):
        with plot:
            hm.Line(position=[[0, 0], [1, 1]])
            raise RuntimeError("rollback")
    assert scene._snapshot()[0] == before
    with pytest.raises(ValueError):
        plot.update(height=-1)
    assert plot.props["height"] == 450
    points.update(size=8)
    assert scene.revision == 2


def test_context_autosave_is_batched_and_skips_failed_context(monkeypatch, tmp_path):
    import hmplot.exporter as exporter

    calls = []
    monkeypatch.setattr(exporter, "save_context_exports", lambda requests: calls.append(requests))
    with hm.Scene(
        filename=tmp_path / "dashboard.PDF",
        export_options={"width": "8in"},
    ) as scene:
        with hm.Plot(
            filename=tmp_path / "detail.png",
            export_options={"scale": 3},
        ):
            hm.Points(position=[[0, 0]])
    assert len(calls) == 1
    assert [(request["kind"], request["path"].name) for request in calls[0]] == [
        ("pdf", "dashboard.PDF"),
        ("png", "detail.png"),
    ]
    assert scene.revision == 1

    calls.clear()
    with pytest.raises(RuntimeError):
        with hm.Plot(filename=tmp_path / "failed.svg"):
            raise RuntimeError("stop")
    assert calls == []


def test_context_autosave_validates_suffix_options_and_directory(tmp_path):
    with pytest.raises(ValueError, match="png, .svg, .pdf, or .html"):
        hm.Plot(filename=tmp_path / "plot.txt")
    with pytest.raises(TypeError, match="Unsupported PNG"):
        hm.Plot(filename=tmp_path / "plot.png", export_options={"width": 100})
    with pytest.raises(FileNotFoundError):
        hm.Plot(filename=tmp_path / "missing" / "plot.svg")
    with pytest.raises(TypeError, match="requires filename"):
        hm.Scene(export_options={"width": "8in"})


def test_facet_cell_export_names_are_readable_and_collision_safe(tmp_path):
    from hmplot.exporter import _cell_paths
    from types import SimpleNamespace

    facet = SimpleNamespace(props={"row": "species", "column": "region"})
    paths = _cell_paths(
        tmp_path / "detail.svg",
        facet,
        [
            {"row": "setosa", "column": "east/west", "data": b"a"},
            {"row": "setosa", "column": "east\\west", "data": b"b"},
        ],
    )
    assert [path.name for path, _ in paths] == [
        "species-setosa_region-east-west_detail.svg",
        "species-setosa_region-east-west_detail-2.svg",
    ]


def test_resources_and_snapshot():
    source = np.array([1.0, 2.0])
    table = hm.Table({"x": source, "y": [3, 4]})
    with hm.Scene() as scene:
        with hm.Data(table):
            with hm.Plot():
                hm.Points(x="x", y="y")
    old = table.columns.copy()
    source[:] = 9
    assert np.frombuffer(old["x"].payload, dtype="<f4").tolist() == [1, 2]
    table.update_columns(x=[5, 6])
    assert table.columns["y"] is old["y"]
    with pytest.raises(ValueError):
        table.update_columns(x=[1])
    assert np.frombuffer(table.columns["x"].payload, dtype="<f4").tolist() == [5, 6]


def test_theme_resources_are_shared_and_update_without_columns():
    paper = hm.create_theme(
        name="Paper",
        typography={"font_family": "Inter", "font_size": 11},
        marks={"Line": {"width": 1.5}},
        palette=["#111111", "#222222"],
    )
    with hm.Scene(theme=paper) as scene:
        with hm.Theme(value=paper):
            with hm.Plot():
                hm.Line(position=[[0, 0], [1, 1]])
    state, _ = scene._snapshot()
    assert state["root"]["props"]["theme"] == {"$theme": paper.id}
    assert state["themes"][paper.id]["value"]["typography"]["fontFamily"] == "Inter"
    revision = scene.revision
    paper.update(axes={"line_width": 0.75})
    assert scene.revision == revision + 1
    assert scene._snapshot()[0]["themes"][paper.id]["value"]["axes"]["lineWidth"] == 0.75
    scene.close()
    assert scene not in paper._scenes


def test_targets_and_explicit_composition():
    plot = hm.Plot(hm.Points(position=[[0, 0], [1, 1]]))
    scene = hm.Scene(plot, hm.Minimap(target=plot))
    scene._validate()
    scene.add(plot)
    assert [child.kind for child in scene.children] == ["Minimap", "Plot"]
    scene._validate()
    unattached = hm.Points()
    with pytest.raises(ValueError):
        with scene:
            hm.Legend(target=unattached)


def test_group_and_pivot_take_reduction_expressions():
    # TODO 137.2: one reduction syntax; reduce= names its replacement.
    group = hm.Group(by="g", columns={"mean_x": hm.mean("x"), "ratio": hm.sum("x") / hm.count()})
    assert set(group.props["columns"]) == {"mean_x", "ratio"}
    assert hm.Pivot(field="s", value=hm.sum("x")).kind == "Pivot"
    with pytest.raises(TypeError, match=r"Group: unknown property 'reduce'. Reductions are expressions: columns="):
        hm.Group(by="g", reduce={"m": {"op": "mean", "field": "x"}})
    with pytest.raises(TypeError, match=r"Pivot: unknown property 'reduce'. The value is a reduction: value=hm.mean"):
        hm.Pivot(field="s", reduce={"op": "sum", "field": "x"})
    assert set(hm.stats.Bin(x="x", columns={"m": hm.median("y")}).props["columns"]) == {"m"}
    assert hm.stats.Bin(x="x", normalization="density").props["normalization"] == "density"
    assert hm.stats.Hexbin(x="x", y="y", columns={"m": hm.mean(hm.col.v)}).props["columns"]["m"].op == "mean"
    # Bins and hexagons are Group keys; hm.bin stays out of `import *` (the builtin bin).
    key = hm.bin("x", 20, interval="1 month")
    assert (key.op, key.args[0], key.args[1]) == ("bin", "x", {"$expression_options": {"bins": 20, "interval": "1 month"}})
    assert hm.hexbin("x", "y", radius=2).args[2] == {"$expression_options": {"radius": 2}}
    assert hm.Group(by=["g", hm.bin("x", [0, 1, 2])]).props["by"][1].op == "bin"
    with pytest.raises(TypeError, match="bin\\(\\) bins must be a positive integer"):
        hm.bin("x", 0)
    with pytest.raises(TypeError, match="bin\\(\\) bins must be"):
        hm.bin("x", hm.col.n)
    np = pytest.importorskip("numpy")
    assert hm.bin("x", np.array([0.0, 1.0, 2.0])).args[1] == {"$expression_options": {"bins": [0.0, 1.0, 2.0]}}
    with pytest.raises(TypeError, match="orientation must be"):
        hm.hexbin("x", "y", orientation="round")
    import hmplot.expressions as expressions
    assert "bin" not in expressions.__all__ and "hexbin" in expressions.__all__
    for kind in (hm.stats.Bin, hm.stats.Hexbin):
        with pytest.raises(TypeError, match=r"unknown property 'reduce'. Reductions are expressions: columns="):
            kind(x="x", y="y", reduce={"m": {"op": "mean", "field": "y"}})


def test_grid_and_lights():
    assert hm.Grid(columns=2).kind == "LayoutGrid"
    assert hm.Interpolate(x="x", values=["y"]).kind == "Interpolate"
    # R2.0: Grid is only the layout, and a plot's axes are only its x, y and z.
    with pytest.raises(TypeError, match="Grid: unknown property 'x'. Grid is a layout; interpolation is hm.Interpolate"):
        hm.Grid(x="x", values=["y"])
    with pytest.raises(TypeError, match=r"'x_bounds'. A plot's axes are its x, y and z: x=\{\"domain\": ...\}"):
        hm.Plot(x_bounds=[0, 1])
    with pytest.raises(TypeError, match="'axes'. axes2d=True draws the axes"):
        hm.Plot(axes=True)
    assert hm.light("directional", position=[1, 2, 3])["position"] == [1, 2, 3]


def test_plot_dynamic_margins_serializes_and_updates():
    plot = hm.Plot(dynamic_margins=False)
    assert plot.props["dynamicMargins"] is False
    plot.update(dynamic_margins=True)
    assert plot.props["dynamicMargins"] is True


def test_plot_responsiveness_follows_width_unless_explicit():
    plot = hm.Plot(width=850, height=520)
    assert plot.props["width"] == 850 and "responsive" not in plot.props
    assert hm.Plot(width=850, responsive=True).props["responsive"] is True
    assert hm.Plot(width=850, responsive=False).props["responsive"] is False
    # A later width change also works on a standalone mark's implicit plot.
    for plot in (hm.Plot(), hm.Points(data={"x": [1], "y": [2]}, x="x", y="y")._scene().children[0]):
        assert "width" not in plot.props and "responsive" not in plot.props
        plot.update(width=850)
        assert plot.props["width"] == 850 and "responsive" not in plot.props


def test_hybrid_sampling_modes_serialize_and_update_for_browser_scenes():
    with hm.Scene() as scene:
        plot = hm.Plot(antialias="ssaa8")
    state, _ = scene._snapshot()
    assert state["root"]["children"][0]["props"]["antialias"] == "ssaa8"
    plot.update(antialias="ssaa16")
    state, _ = scene._snapshot()
    assert state["root"]["children"][0]["props"]["antialias"] == "ssaa16"


def test_row_widths_share_the_row():
    # TODO 69.16: a Row's widths are its children's shares, sent as given; each must be positive.
    with hm.Scene() as scene:
        with hm.Row(widths=[3, 2], wrap=True, min_width=286, gap=12) as row:
            hm.Plot()
            hm.Plot()
    state, _ = scene._snapshot()
    assert state["root"]["children"][0]["props"] == {"widths": [3, 2], "wrap": True, "minWidth": 286, "gap": 12}
    with pytest.raises(ValueError, match=r"Row widths must be a list of positive numbers, each child's share of the row in order, such as widths=\[3, 2\]; received \[1, 0\]."):
        row.update(widths=[1, 0])


def test_point_and_hemisphere_lights():
    point = hm.light("point", position=np.array([0.0, 1.0, 2.0]), intensity=np.float32(3), distance=np.int64(0), decay=0, color="#fff4e0")
    assert point == {"kind": "point", "position": [0.0, 1.0, 2.0], "intensity": 3, "distance": 0, "decay": 0,
                     "color": "#fff4e0"}
    sky = hm.light("hemisphere", color="#bcd6ff", ground_color="#3a2a1a", intensity=0.6, position=[0, 0, 1])
    assert sky == {"kind": "hemisphere", "color": "#bcd6ff", "ground_color": "#3a2a1a", "intensity": 0.6, "position": [0, 0, 1]}
    plot = hm.Plot(type="3d", lights=[point, sky])
    assert plot.props["lights"] == [point, {"groundColor" if key == "ground_color" else key: value
                                            for key, value in sky.items()}]
    plot.update(lights=[hm.light("point", position=[1, 0, 0], decay=0)])
    assert plot.props["lights"][0]["position"] == [1, 0, 0]
    for kwargs in ({"intensity": -1}, {"position": [1, 2]}, {"decay": float("nan")}):
        with pytest.raises(ValueError, match="Plot.lights"):
            hm.light("point", **kwargs)
    with pytest.raises(ValueError, match="does not take position"):
        hm.light("ambient", position=[1, 2, 3])
    for name in ("AmbientLight", "DirectionalLight", "PointLight", "HemisphereLight"):
        with pytest.raises(AttributeError, match=r"Plot\(lights"):
            getattr(hm, name)
    assert hm.light("ambient", intensity=hm.input.intensity)["intensity"] is not None


@pytest.mark.parametrize("kind, props", [
    ("Bar", {"x": "a", "y": "b"}), ("BoxPlot", {"x": "a", "y": "b"}), ("Crosshair", {}),
    ("DensityContour", {"x": "x", "y": "y"}), ("Ecdf", {"x": "x"}),
    ("Lollipop", {"x": "x", "y": "y"}), ("Pie", {"value": "v", "category": "c"}),
    ("Polygon", {"x": "x", "y": "y"}), ("RuleX", {"x": 1.5}), ("RuleY", {"y": 2.5}),
    ("Smooth", {"x": "x", "y": "y"}), ("Swarm", {"x": "a", "y": "b"}),
    ("VectorTile", {"url": "/t/{z}/{x}/{y}.pbf", "tile": (1, 0, 0)}), ("Violin", {"x": "a", "y": "b"}),
])
def test_every_mark_outside_a_plot_is_refused_as_points_is(kind, props):
    # Every mark in the generated inventory (registry.json "marks") needs a Plot, as Points does.
    with pytest.raises(ValueError, match=re.escape(f"{kind} must be inside a Plot: create it in a `with hm.Plot():` block")):
        with hm.Scene():
            hm.Plot()
            getattr(hm.charts if kind in hm.charts.__all__ else hm, kind)(**props)


def test_plot_effects_and_glow(tmp_path):
    """TODO 37.5, 138.3: the sky's image forms, the built-in effects' checks the browser makes, a
    plugin's effect passed on, and the components and keyword the effects replace."""
    pytest.importorskip("PIL")
    from PIL import Image as PILImage
    import io
    sky = lambda **params: hm.effect("sky", **params)
    # A URL goes as is; a path, bytes or a PIL image as its encoded bytes (a JPEG stays a JPEG).
    assert sky(image="https://example.org/stars.jpg")["image"] == "https://example.org/stars.jpg"
    assert sky(image="data:image/png;base64,AAAA")["image"].startswith("data:")
    jpeg = io.BytesIO()
    PILImage.new("RGB", (8, 4), (10, 20, 30)).save(jpeg, format="JPEG")
    (tmp_path / "stars.jpg").write_bytes(jpeg.getvalue())
    from_path = sky(image=str(tmp_path / "stars.jpg"))["image"]
    assert from_path.descriptor() == {"id": from_path.id, "shape": [len(jpeg.getvalue())], "dtype": "uint8",
                                      "byte_order": "little", "logical_type": "encoded-image", "mime": "image/jpeg"}
    assert from_path.payload == jpeg.getvalue()
    assert sky(image=tmp_path / "stars.jpg")["image"].payload == jpeg.getvalue()
    assert sky(image=jpeg.getvalue())["image"].mime == "image/jpeg"
    assert sky(image=PILImage.new("RGB", (8, 4)))["image"].mime == "image/png"
    with pytest.raises(ValueError, match="Plot.effects: sky image 'stars.png' is neither a URL \\(http, https or data:\\) nor an existing file."):
        sky(image="stars.png")
    with pytest.raises(ValueError, match="Plot.effects: sky image bytes is not a PNG, JPEG, WebP, GIF or BMP file."):
        sky(image=b"not an image")
    with pytest.raises(TypeError, match="Plot.effects: sky image is a URL, a file path, bytes or a PIL image; got int."):
        sky(image=3)
    with pytest.raises(ValueError, match="Plot.effects: sky takes image or the gradient's colors \\(zenith\\), not both."):
        sky(image="https://example.org/stars.jpg", zenith="#123456")
    with pytest.raises(ValueError, match=r"Plot.effects: sky rotation is \[x, y, z\] in degrees"):
        sky(rotation=[0, 90])
    with pytest.raises(ValueError, match=r"Plot.effects: sky 'height' is not one of its parameters \(image, zenith"):
        sky(height=3)
    # The image travels in the snapshot's columns; the gradient's colors and rotation are plain, and
    # a plugin's effect goes as given (the browser checks it against its schema).
    with hm.Scene() as scene:
        with hm.Plot(type="3d", effects=[sky(image=jpeg.getvalue(), rotation=(0, 45, 0)),
                                         hm.effect("bloom", strength=2, radius=0.25),
                                         hm.effect("fog", near=10, far=50),
                                         hm.effect("acme.vignette", amount=0.4)]) as plot:
            hm.Points3D(x=[1], y=[2], z=[3], glow=2)
    state, columns = scene._snapshot()
    effects = plot.props["effects"]
    assert columns[effects[0]["image"].id].descriptor()["logical_type"] == "encoded-image"
    assert effects[0]["rotation"] == [0, 45, 0]
    assert effects[1:] == [{"kind": "bloom", "strength": 2, "radius": 0.25}, {"kind": "fog", "near": 10, "far": 50},
                           {"kind": "acme.vignette", "amount": 0.4}]
    # Checks, as the browser makes them.
    with pytest.raises(ValueError, match=r"Points: glow is a number of at least 0 \(0, the default, does not glow\); got -1."):
        hm.Points(x=[1], y=[1], glow=-1)
    with pytest.raises(ValueError, match="Plot.effects: bloom strength is a number of at least 0; got -1."):
        hm.effect("bloom", strength=-1)
    with pytest.raises(ValueError, match="Plot.effects: bloom radius is a number from 0 to 1; got 2."):
        hm.effect("bloom", radius=2)
    with pytest.raises(ValueError, match="Plot.effects: fog needs finite distances with 0 <= near < far; got near 5 and far 1."):
        hm.Plot(effects=[{"kind": "fog", "near": 5, "far": 1}])
    with pytest.raises(ValueError, match="Plot.effects: fog 'start' is not one of its parameters"):
        hm.effect("fog", near=1, far=5, start=0)
    with pytest.raises(ValueError, match="Plot.effects lists bloom twice; keep one."):
        hm.Plot(effects=[hm.effect("bloom"), hm.effect("bloom")])
    with pytest.raises(TypeError, match="Plot.effects is a list of hm.effect"):
        hm.Plot(effects=hm.effect("bloom"))
    # The sky and fog only in 3D.
    for kind in ("sky", "fog"):
        with pytest.raises(ValueError, match=f'Plot.effects: the {kind} needs a 3D view, and the Plot is 2D.'):
            with hm.Scene() as flat:
                hm.Plot(effects=[hm.effect(kind, **({"near": 1, "far": 2} if kind == "fog" else {}))])
            flat._snapshot()
    # The components and keyword the effects replace name them.
    for name in ("Sky", "Bloom"):
        with pytest.raises(AttributeError, match=f'hm.{name} was removed. {name} is an effect of its Plot: hm.Plot\\(effects='):
            getattr(hm, name)
    with pytest.raises(TypeError, match=r"Plot: unknown property 'fog'. Fog is an effect: effects=\[hm.effect\(\"fog\""):
        hm.Plot(fog={"near": 1, "far": 2})
    # A Frame's atmosphere (TODO 37.6).
    assert hm.Frame(coordinates="spherical", atmosphere={"color": "#88bbff", "thickness": 0.2}).props["atmosphere"] == \
        {"color": "#88bbff", "thickness": 0.2}
    assert hm.Frame(coordinates="spherical", atmosphere=True).props["atmosphere"] is True
    with pytest.raises(ValueError, match=r"Frame: atmosphere thickness is a number above 0 \(a fraction of the globe's radius\); got 0."):
        hm.Frame(atmosphere={"thickness": 0})
    with pytest.raises((TypeError, ValueError), match="Frame: atmosphere is True, False or"):
        hm.Frame(atmosphere="blue")


def test_image_files_and_plain_props_from_inputs(tmp_path):
    """TODO 69.10: an Image's data as an image file (sent as the file, as the sky's image), the
    sky's visible, and plain props given as expressions of inputs, which the browser evaluates."""
    pytest.importorskip("PIL")
    from PIL import Image as PILImage
    import io
    png = io.BytesIO()
    PILImage.new("RGBA", (4, 2), (10, 20, 30, 128)).save(png, format="PNG")
    (tmp_path / "map.png").write_bytes(png.getvalue())
    image = hm.Image(data=str(tmp_path / "map.png")).props["data"]
    assert image.descriptor()["logical_type"] == "encoded-image" and image.mime == "image/png"
    assert image.payload == png.getvalue()
    assert hm.Image(data=png.getvalue()).props["data"].mime == "image/png"
    assert hm.Image(data=PILImage.new("RGB", (2, 2))).props["data"].mime == "image/png"
    assert hm.Image(data="https://example.org/map.jpg").props["data"] == "https://example.org/map.jpg"
    assert hm.Image(data=[[[0.1, 0.2, 0.3]]]).props["data"] == [[[0.1, 0.2, 0.3]]]
    with pytest.raises(ValueError, match="Image: data 'map.jpg' is neither a URL \\(http, https or data:\\) nor an existing file."):
        hm.Image(data="map.jpg")
    with pytest.raises(ValueError, match="Image: data bytes is not a PNG, JPEG, WebP, GIF or BMP file."):
        hm.Image(data=b"not an image")
    with pytest.raises(TypeError, match="Plot.effects: sky visible is True or False"):
        hm.effect("sky", visible="no")
    # Expressions of inputs where a plain value goes: kept as expressions, their reads checked.
    angle = hm.input.day / 58
    with hm.Scene() as scene:
        with hm.Row(wrap=True, min_width=0):
            hm.Slider(name="day", min=0, max=365)
            hm.Checkbox(name="on", value=True)
        with hm.Plot(type="3d", camera_position=[hm.where(hm.input.on, 10, 90), 70, 140],
                     effects=[hm.effect("fog", near=hm.where(hm.input.on, 10, 1e9), far=hm.where(hm.input.on, 50, 2e9)),
                              hm.effect("sky", zenith="#123456", visible=hm.input.on)]):
            with hm.Frame(coordinates="spherical", placement={"anchor": [8 * hm.cos(angle), 0, -8 * hm.sin(angle)],
                                                              "size": [1, 1, 1]}) as frame:
                hm.Image(data=png.getvalue(), glow=hm.where(hm.input.on, 1, 0))
    scene._snapshot()
    from hmplot.expressions import Expression
    assert isinstance(frame.props["placement"]["anchor"][0], Expression)
    with pytest.raises(ValueError, match="camera_position must be three numbers"):
        hm.Plot(camera_position=[hm.input.on, 1])
    with pytest.raises(ValueError, match="no input named 'missing'"):
        with hm.Scene() as broken:
            with hm.Plot(type="3d"):
                hm.Frame(placement={"anchor": [hm.input.missing, 0, 0], "size": [1, 1, 1]})
        broken._snapshot()


def test_adding_a_child_again_moves_it_to_the_end():
    data = {"bill_length": [1.0, 2.0], "bill_depth": [3.0, 4.0], "species": ["a", "b"]}
    with hm.Plot(data=data, axes2d=True) as plot:
        points = hm.Points(x="bill_length", y="bill_depth", fill="species")
        legend = hm.Legend(target=points)
        plot.add(legend)
    assert [child.kind for child in plot.children] == ["Points", "Legend"]
    assert plot.add(points) is plot
    assert plot.children == [legend, points]
    # A failing outer block restores the order.
    with pytest.raises(RuntimeError):
        with plot:
            plot.add(legend)
            raise RuntimeError("rollback")
    assert plot.children == [legend, points]
    # A real second parent still raises, naming the first.
    with pytest.raises(ValueError, match="This Points already belongs to a Plot, and a component has one parent"):
        hm.Plot(data=data).add(points)
    alone = hm.Points(data=data, x="bill_length", y="bill_depth")
    alone._scene()
    with pytest.raises(ValueError, match="was displayed on its own"):
        hm.Plot(data=data).add(alone)


def test_explicit_placement_wins_over_the_creating_block():
    # TODO 40.3: a node attached only because it was created in an open `with` block moves to the
    # first place it is explicitly put, even from an outer block.
    with hm.Scene() as scene:
        with hm.Plot(data={"a": [1.0], "b": [2.0]}) as plot:
            points = hm.Points(x="a", y="b")
            with hm.Frame() as frame:
                hm.Frame(points)
    inner = frame.children[0]
    assert inner.children == [points] and points not in plot.children
    # One put somewhere explicitly stays there.
    with pytest.raises(ValueError, match="already belongs to a Frame"):
        with plot:
            hm.Frame(points)
    assert points.parent is inner
    # One whose block has closed stays too: that block may already be displayed.
    with pytest.raises(ValueError, match="already belongs to a Plot"):
        with hm.Plot(data={"a": [1.0], "b": [2.0]}) as other:
            later = hm.Line(x="a", y="b")
        hm.Frame().add(later)
    assert later.parent is other
    # A failing block restores both the parent and the record of how the node was attached.
    with plot:
        kept = hm.Line(x="a", y="b")
    with pytest.raises(RuntimeError):
        with plot:
            hm.Frame(kept)
            raise RuntimeError("rollback")
    assert kept.parent is plot and kept._by_context and kept in plot.children
    assert scene.children == [plot]


@pytest.mark.asyncio
async def test_task_isolation():
    async def other():
        with pytest.raises(RuntimeError):
            hm.Plot()
        with hm.Scene() as independent:
            hm.Plot()
        return independent

    with hm.Scene() as scene:
        result = await asyncio.create_task(other())
        hm.Plot()
    assert len(scene.children) == 1 and len(result.children) == 1


def test_categorical_missing_and_overflow():
    t = hm.Table({"a": ["x", None, "y"], "b": [1, None, 3]})
    assert t.columns["a"].categories == ("x", "y")
    assert t.columns["b"].dtype == "float32"
    with pytest.raises(ValueError):
        hm.Table({"x": [1e100]})


@pytest.mark.asyncio
async def test_command_completion_from_comm_thread():
    import threading

    with hm.Scene() as scene:
        hm.Plot()
    scene._views["test"] = {"ready": True}

    class Transport:
        def send(self, message):
            thread = threading.Thread(
                target=lambda: scene._receive(
                    {
                        "type": "result",
                        "scene": scene.id,
                        "request": message["request"],
                        "value": 42,
                    },
                    [],
                )
            )
            thread.start()
            thread.join()

    scene._widget = Transport()
    assert await asyncio.wait_for(scene.when_settled(), 1) == 42


@pytest.mark.asyncio
async def test_command_timeout_is_bounded_and_does_not_poison_next_request():
    with hm.Scene() as scene:
        plot = hm.Plot()
    scene._views["test"] = {"ready": True, "revision": scene.revision}

    class Transport:
        def __init__(self):
            self.messages = []

        def send(self, message):
            self.messages.append(message)
            if message.get("type") == "command" and message.get("command") == "fit":
                scene._receive({
                    "type": "result", "scene": scene.id,
                    "request": message["request"], "value": "recovered",
                }, [])

    scene._widget = Transport()
    with pytest.raises(hm.SceneError) as caught:
        await plot.when_settled(timeout=0.02)
    assert caught.value.code == "bridge.timeout"
    assert any(message.get("type") == "cancel" for message in scene._widget.messages)
    assert await plot.fit(timeout=1) == "recovered"


def test_interaction_messages_reject_stale_sequences_and_generations():
    table = hm.Table({"x": [0, 1]})
    with hm.Scene() as scene:
        with hm.Data(table):
            hm.Plot()
    scene._views["a"] = {"ready": True}
    resource = table.selection
    base = {
        "type": "interaction", "scene": scene.id, "view": "a",
        "revision": scene.revision, "generation": scene.revision,
        "resource": resource.id, "active": True,
    }
    scene._receive({**base, "sequence": 2, "owners": {table.id: [1]}}, [])
    scene._receive({**base, "sequence": 1, "owners": {table.id: [0]}}, [])
    assert resource.rows == (1,)
    scene._receive({**base, "generation": scene.revision - 1, "sequence": 3,
                    "owners": {table.id: [0]}}, [])
    assert resource.rows == (1,)


def test_strip_brush_constraints_carry_their_frame():
    table = hm.Table({"x": [10.0, 50.0, 90.0], "b": [5.0, 45.0, 95.0]})
    with hm.Scene() as scene:
        with hm.Plot(data=table, x={"domain": [0, 100]}, y={"domain": [0, 100]}):
            with hm.Frame(x={"domain": [0, 100], "range": [60, 95]}, y={"domain": [0, 100], "range": [10, 90]}):
                hm.Points(x="x", y="b", brush={"axis": "y"})
    scene._views["a"] = {"ready": True}
    # The descriptor the browser publishes after a Shift-drag on the child frame's y strip.
    strip = {"identity": "column:b", "name": "b", "type": "numeric", "frame": "1", "axis": "y",
             "origin": "strip", "bounds": [40.0, 70.0]}
    scene._receive({
        "type": "interaction", "scene": scene.id, "view": "a",
        "revision": scene.revision, "generation": scene.revision, "sequence": 1,
        "resource": table.brush.id, "active": True, "owners": {}, "constraints": {table.id: [strip]},
    }, [])
    (constraint,) = table.brush.get_constraints(data=table)
    assert constraint == strip
    assert (constraint["frame"], constraint["axis"], constraint["origin"]) == ("1", "y", "strip")


def test_series_line_brush_constraints_name_their_series():
    # TODO 62.1: a Line brushes whole series. Its constraints are column intervals that name the
    # series, so a scene restored from Python brushes whole series again.
    table = hm.Table({"day": [0.0, 1.0, 0.0, 1.0], "value": [1.0, 2.0, 3.0, 4.0], "city": ["a", "a", "b", "b"]})
    with hm.Scene() as scene:
        with hm.Plot(data=table):
            hm.Line(x="day", y="value", series="city", brush=True)
    state, _ = scene._snapshot()
    [plot] = state["root"]["children"]
    assert plot["children"][0]["props"] == {"x": "day", "y": "value", "series": "city", "brush": True}
    scene._views["a"] = {"ready": True}
    interval = {"identity": "column:day", "name": "day", "type": "numeric", "frame": "0", "axis": "x",
                "origin": "plot", "bounds": [0.5, 1.0], "series": "city"}
    scene._receive({
        "type": "interaction", "scene": scene.id, "view": "a",
        "revision": scene.revision, "generation": scene.revision, "sequence": 1,
        "resource": table.brush.id, "active": True, "owners": {}, "constraints": {table.id: [interval]},
    }, [])
    assert table.brush.get_constraints(data=table) == (interval,)


def test_notebook_wait_pumps_only_its_own_comm_messages(monkeypatch):
    from collections import deque
    from types import SimpleNamespace
    from hmplot.widget import SceneWidget
    import IPython

    delivered = []

    class Kernel:
        def dispatch_shell(self, message):
            raise AssertionError("The normal shell dispatcher must not run recursively")

    kernel = Kernel()
    kernel.session = SimpleNamespace(
        feed_identities=lambda raw, copy: ([], raw[0]),
        deserialize=lambda raw, content, copy: raw,
    )
    kernel.shell_stream = object()
    kernel.comm_manager = SimpleNamespace(
        comm_msg=lambda stream, identities, message: delivered.append(message["content"]["data"])
    )

    def item(index, kind, comm_id):
        message = {
            "header": {"msg_type": kind},
            "content": {"comm_id": comm_id, "data": index},
        }
        return (index, kernel.dispatch_shell, ([message],))

    unrelated = item(1, "comm_msg", "other")
    own = item(2, "comm_msg", "ours")
    execute = item(3, "execute_request", "ours")
    kernel.msg_queue = SimpleNamespace(_queue=deque([unrelated, own, execute]))
    monkeypatch.setattr(IPython, "get_ipython", lambda: SimpleNamespace(kernel=kernel))
    widget = SimpleNamespace(comm=SimpleNamespace(comm_id="ours"))
    SceneWidget._pump_own_comm_messages(widget)
    assert delivered == [2]
    assert list(kernel.msg_queue._queue) == [unrelated, execute]


def test_ipykernel7_adapter_dispatches_only_its_widget_messages(monkeypatch):
    from types import SimpleNamespace
    zmq = pytest.importorskip("zmq")
    IPython = pytest.importorskip("IPython")
    from hmplot.widget import SceneWidget

    delivered, forwarded = [], []
    messages = [
        [{"header": {"msg_type": "comm_msg"}, "content": {"comm_id": "ours", "data": 1}}],
        [{"header": {"msg_type": "comm_msg"}, "content": {"comm_id": "other", "data": 2}}],
    ]

    class Socket:
        def recv_multipart(self, **kwargs):
            if messages:
                return messages.pop(0)
            raise zmq.Again()

    kernel = SimpleNamespace(
        session=SimpleNamespace(
            feed_identities=lambda raw, copy: ([], raw[0]),
            deserialize=lambda raw, content, copy: raw,
        ),
        shell_stream=object(),
        comm_manager=SimpleNamespace(
            comm_msg=lambda stream, identities, message: delivered.append(message["content"]["data"])
        ),
    )
    monkeypatch.setattr(IPython, "get_ipython", lambda: SimpleNamespace(kernel=kernel))
    stream = SimpleNamespace(socket=Socket())
    widget = SimpleNamespace(comm=SimpleNamespace(comm_id="ours"), _dispatch_own_message=lambda *args: SceneWidget._dispatch_own_message(widget, *args))
    adapter = (kernel, "ours", stream, lambda raw: forwarded.append(raw), False)
    assert SceneWidget._pump_comm(widget, adapter)
    assert delivered == [1]
    assert len(forwarded) == 1


def test_documented_controls_composition():
    with pytest.raises(AttributeError, match="Use hm.Row"):
        hm.Controls
    with hm.Scene() as scene:
        controls = hm.Row(wrap=True, min_width=0)
        with hm.Data({"x": [1, 2]}):
            with hm.Plot():
                with hm.stats.Bin(x="x", bins=hm.input.bins):
                    hm.Rect(x0="x0", x1="x1", y0=0, y1="count")
        controls.add(hm.Slider(name="bins", min=4, max=40, step=1, value=12))
    assert controls.children[0].kind == "Slider"
    assert all(n.kind != "Slider" for n in scene.children)


def test_invalid_nesting_and_linking():
    with pytest.raises(ValueError):
        hm.Scene(hm.Points(position=[[0, 0]]))
    with pytest.raises(ValueError):
        with hm.Scene():
            a = hm.Plot(type="3d")
            b = hm.Plot()
            hm.LinkViews(a, b)
    # TODO 136.14: linked plots share one domain unless scales="free".
    with pytest.raises(ValueError, match='"shared" or "free"'):
        with hm.Scene():
            a, b = hm.Plot(), hm.Plot()
            hm.LinkViews(a, b, scales="independent")


def test_array_like_channels_convert_as_table_columns():
    # TODO 40.1: a Series channel is the same column as that column of a Table, named after it.
    pd = pytest.importorskip("pandas")
    pl = pytest.importorskip("polars")

    frame = pd.DataFrame({"a": [1.0, 2.0, 3.0], "s": pd.Categorical(["x", "y", "x"]),
                          "t": pd.to_datetime(["2020-01-01", "2020-01-02", "2020-01-03"]).tz_localize("UTC")})
    table = hm.Table(frame)
    for name in ("a", "s", "t"):
        channel = hm.Points(data=frame, x="a", y=frame[name]).props["y"]
        expected = table.columns[name]
        assert (channel.dtype, channel.payload, channel.categories, channel.logical_type) == (
            expected.dtype, expected.payload, expected.categories, expected.logical_type)
        assert channel.descriptor()["name"] == name
    assert hm.Points(data=frame, x="a", y=frame.index).props["y"].shape == (3,)
    assert hm.Points(data=frame, x="a", y=pl.Series("p", [1.0, 2.0, 3.0])).props["y"].name == "p"
    with pytest.raises(TypeError, match="a DataFrame is a table"):
        hm.Points(data=frame, x="a", y=frame)
    with pytest.raises(TypeError, match=r"Points\.y: unsupported value of type object"):
        hm.Points(data=frame, x="a", y=object())
    tensor = type("Tensor", (), {"__array__": lambda self, *a, **k: np.zeros(3), "__module__": "torch"})
    with pytest.raises(TypeError, match="device arrays"):
        hm.Points(data=frame, x="a", y=tensor())
    # Rows are matched by position, so a reordered Series of the same length is refused.
    with pytest.raises(ValueError, match=r"Points\.y: the Series' index does not match"):
        with hm.Scene():
            with hm.Plot(data=frame):
                hm.Points(x="a", y=frame["a"].iloc[::-1])


def test_table_adapters_and_release():
    pd = pytest.importorskip("pandas")
    pl = pytest.importorskip("polars")

    for frame in (
        pd.DataFrame({"x": [1, 2]}),
        pl.DataFrame({"x": [1, 2]}),
        [{"x": 1}, {"x": 2}],
    ):
        assert hm.Table(frame).columns["x"].shape == (2,)
    table = hm.Table({"x": [1, 2]})
    with hm.Scene() as scene:
        with hm.Data(table) as data:
            hm.Plot()
    assert scene in table._scenes
    scene.remove(data)
    assert scene not in table._scenes


def _payload(col):
    """A column's values, None where its validity mask marks a row missing."""
    from hmplot.data import _key_buffer

    raw, missing = _key_buffer(col)
    return [None if missing is not None and gap else value for value, gap in zip(raw.tolist(), (missing if missing is not None else raw).tolist())]


def test_arrow_tables_and_dataframe_columns_keep_types_zones_and_missing_rows():
    """TODO 48.4: pyarrow tables; Polars times keep their zone, an Enum its order; pandas NA is missing."""
    import datetime as dt
    pd = pytest.importorskip("pandas")
    pl = pytest.importorskip("polars")
    pa = pytest.importorskip("pyarrow")

    missing = None
    table = hm.Table(pa.table({
        "x": [1, None, 2**40], "s": ["a", None, "a"],
        "t": pa.array([0, None, 1000], pa.timestamp("ms", tz="Europe/Paris")),
        "c": pa.array(["x", "y", "x"]).dictionary_encode(),
    }))
    x, s, t, c = (table.columns[k] for k in "xstc")
    assert (x.dtype, _payload(x)) == ("int64", [1, missing, 2**40])
    assert (s.categories, _payload(s)) == (("a",), [0, -1, 0])
    assert (t.logical_type, t.unit, t.timezone, _payload(t)) == ("datetime", "ms", "Europe/Paris", [0, missing, 1000])
    assert c.categories == ("x", "y")
    polars = hm.Table(pl.DataFrame({
        "t": pl.Series([dt.datetime(2026, 1, 1), None]).cast(pl.Datetime("ms", "Europe/Paris")),
        "e": pl.Series(["hi", "lo"], dtype=pl.Enum(["lo", "hi"])),
    }))
    assert (polars.columns["t"].unit, polars.columns["t"].timezone) == ("ms", "Europe/Paris")
    assert polars.columns["e"].categories == ("lo", "hi")
    pandas = hm.Table(pd.DataFrame({"s": pd.Series(["a", None], dtype="string"),
                                    "i": pd.Series([2**40, None], dtype="Int64")}))
    assert _payload(pandas.columns["s"]) == [0, -1]
    assert _payload(pandas.columns["i"]) == [2**40, missing]
    with pytest.warns(UserWarning, match="collected a Polars LazyFrame"):
        assert hm.Table(pl.DataFrame({"x": [1, 2]}).lazy()).columns["x"].shape == (2,)
    with pytest.raises(TypeError, match=re.escape("Arrow type list<item: int64> is not supported")):
        hm.Table(pa.table({"n": [[1], [2, 3]]}))


def test_integer_columns_keep_sign_range_and_missing_rows_apart():
    """TODO 69.5 (CODEX_REVIEW #6): uint64 stays unsigned, -2**63 is a value, missing rows are a
    validity mask after the values (never a value), and keys stay exact."""
    pd = pytest.importorskip("pandas")
    pl = pytest.importorskip("polars")
    pa = pytest.importorskip("pyarrow")
    from hmplot.data import typed_column

    signed = typed_column(np.array([-2**63, 2**63 - 1], dtype=np.int64))
    unsigned = typed_column(np.array([2**63, 2**64 - 1], dtype=np.uint64))
    assert (signed.dtype, signed.nullable, _payload(signed)) == ("int64", False, [-2**63, 2**63 - 1])
    assert "validity" not in signed.descriptor() and len(signed.payload) == 16
    assert (unsigned.dtype, unsigned.source_dtype, _payload(unsigned)) == ("uint64", "uint64", [2**63, 2**64 - 1])
    assert (typed_column(np.array([0, 255], dtype=np.uint8)).dtype, typed_column(np.array([0, 255], dtype=np.uint8)).source_dtype) == ("int64", "uint8")
    masked = typed_column(np.ma.masked_array([-2**63, 0, 7], mask=[False, True, False]))
    assert (masked.descriptor()["validity"], masked.nullable, len(masked.payload)) == ("uint8", True, 3 * 8 + 3)
    assert _payload(masked) == [-2**63, None, 7] and masked.payload[24:] == bytes([1, 0, 1])
    # pandas, pyarrow and Polars nullable integers keep their mask, and uint64 values past 2**63.
    for table in (hm.Table(pd.DataFrame({"u": pd.Series([2**63, None], dtype="UInt64"), "i": pd.Series([-2**63, None], dtype="Int64")})),
                  hm.Table(pa.table({"u": pa.array([2**63, None], pa.uint64()), "i": pa.array([-2**63, None], pa.int64())})),
                  hm.Table(pl.DataFrame({"u": pl.Series([2**63, None], dtype=pl.UInt64), "i": pl.Series([-2**63, None], dtype=pl.Int64)}))):
        u, i = table.columns["u"], table.columns["i"]
        assert (u.dtype, _payload(u), i.dtype, _payload(i)) == ("uint64", [2**63, None], "int64", [-2**63, None])
    # Keys: 2**63 and 2**63 + 1 are one float, but two identities, table keys and offsets.
    big = np.array([2**63, 2**63 + 1, 2**64 - 1], dtype=np.uint64)
    assert hm.identity(keys=big).keys.dtype == "uint64"
    table = hm.Table({"id": big, "x": [1.0, 2.0, 3.0]}, key="id")
    table.set_offsets("x", {2**63 + 1: 5})
    assert table.offsets.to_dict("records") == [{"key": 2**63 + 1, "column": "x", "delta": 5.0}]
    nullable = hm.Table({"n": np.ma.masked_array([1, 2], mask=[False, True])}).set_offsets("n", [1, 1])
    assert np.isnan(np.frombuffer(nullable.apply_offsets().columns["n"].payload, "<f4")[1])
    with pytest.raises(ValueError, match="Identity keys cannot be missing"):
        hm.identity(keys=np.ma.masked_array([1, 2], mask=[False, True]))
    with pytest.raises(ValueError, match=re.escape("Column 't': Datetime values beyond 2**63 - 1 ms are out of range.")):
        hm.Table({"t": np.array([2**63], dtype=np.uint64)}, schema={"t": "datetime"})


@pytest.mark.parametrize("kind", ["date", "datetime", "timedelta"])
def test_nullable_python_times_convert_without_deprecation(kind):
    import datetime as dt
    import warnings
    from hmplot.data import typed_column

    value = {"date": dt.date(2024, 10, 1),
             "datetime": dt.datetime(2024, 10, 1, tzinfo=dt.timezone.utc),
             "timedelta": dt.timedelta(seconds=3)}[kind]
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        column = typed_column([value, None])
    assert column.unit == "us"
    assert _payload(column) == [3_000_000 if kind == "timedelta" else 1727740800000000, None]
    assert column.logical_type == ("duration" if kind == "timedelta" else "datetime")


def test_numpy_times_travel_in_units_the_browser_reads():
    """TODO 69.6 (CODEX_REVIEW #7): dates travel as days ("d"), months and years by the calendar;
    finer units than ns as ns; calendar durations, unknown units and overflows are refused."""
    pd = pytest.importorskip("pandas")
    from hmplot.data import typed_column

    days = typed_column(np.array(["2026-01-01", "2026-01-02", "NaT"], dtype="datetime64[D]"))
    assert (days.unit, _payload(days), days.descriptor()["validity"]) == ("d", [20454, 20455, None], "uint8")
    assert (typed_column(np.array(["2026-01", "2026-03"], dtype="datetime64[M]")).unit,
            _payload(typed_column(np.array(["2026-01", "2026-03"], dtype="datetime64[M]")))) == ("d", [20454, 20513])
    assert _payload(typed_column(np.array(["2024", "2025"], dtype="datetime64[Y]"))) == [19723, 20089]
    weeks = typed_column(np.array([1, 2], dtype="timedelta64[W]"))
    assert (weeks.logical_type, weeks.unit, _payload(weeks)) == ("duration", "d", [7, 14])
    assert (typed_column(np.array([1, 2], dtype="timedelta64[D]")).unit, typed_column(np.array([3], dtype="timedelta64[ms]")).unit) == ("d", "ms")
    assert (typed_column(np.array([1500, 2500], dtype="datetime64[ps]")).unit,
            _payload(typed_column(np.array([1500, 2500], dtype="datetime64[ps]")))) == ("ns", [1, 2])
    # A tz-aware pandas column keeps its dtype's unit (microseconds in pandas 3).
    zoned = hm.Table(pd.DataFrame({"t": pd.Series(pd.to_datetime(["2026-01-01", None])).dt.tz_localize("UTC")})).columns["t"]
    assert _payload(zoned)[0] * {"s": 1e3, "ms": 1, "us": 1e-3, "ns": 1e-6}[zoned.unit] == 1767225600000 and _payload(zoned)[1] is None
    # Numbers with a schema: whole counts of its unit ("D" is "d"); NaN is missing.
    assert typed_column([3, 4], type="duration", unit="D").unit == "d"
    assert _payload(typed_column([1.0, float("nan")], type="duration", unit="s")) == [1, None]
    with pytest.raises(ValueError, match=re.escape("Duration values given as numbers count whole s; pass them in a finer unit (unit='ms')")):
        typed_column([1.5], type="duration", unit="s")
    with pytest.raises(ValueError, match="unit is one of ns, us, ms, s, m, h, d; received 'W'"):
        typed_column([3, 4], type="duration", unit="W")
    with pytest.raises(ValueError, match=re.escape("A duration in months (timedelta64[M]) has no fixed length")):
        typed_column(np.array([1], dtype="timedelta64[M]"))
    with pytest.raises(ValueError, match=re.escape("Column 't': Times in datetime64[D] are out of range in ns")):
        hm.Table({"t": np.array(["2500-01-01"], dtype="datetime64[D]")}, schema={"t": {"type": "datetime", "unit": "ns"}})
    with pytest.raises(ValueError, match="out of the browser's date range"):
        typed_column(np.array([10**17], dtype="datetime64[D]"))
    # Grid coordinates go through the same conversion.
    xr = pytest.importorskip("xarray")
    grid = hm.Table.from_xarray(xr.DataArray(np.zeros(2), dims="time", name="v",
        coords={"time": np.array(["2026-01-01", "2026-01-02"], dtype="datetime64[D]")}))
    time = grid.grid.dims[0].coords
    step = np.diff(_payload(time))[0] * {"d": 864e5, "s": 1e3, "ms": 1, "us": 1e-3, "ns": 1e-6}[time.unit]
    assert step == 864e5


def test_table_from_parquet_reads_the_named_columns(tmp_path):
    pa = pytest.importorskip("pyarrow")
    pq = pytest.importorskip("pyarrow.parquet")

    path = tmp_path / "data.parquet"
    pq.write_table(pa.table({"x": [1.5, 2.5], "y": [3, 4], "g": ["a", "b"]}), path, compression="zstd")
    assert list(hm.Table.from_parquet(path, columns=["x", "g"]).columns) == ["x", "g"]
    assert hm.Table.from_arrow(pa.table({"x": [1]})).columns["x"].shape == (1,)


def test_arrow_constructors_name_the_extra_without_pyarrow(monkeypatch):
    import builtins

    real = builtins.__import__

    def without_pyarrow(name, *args, **kwargs):
        if name == "pyarrow" or name.startswith("pyarrow."):
            raise ImportError(name)
        return real(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", without_pyarrow)
    with pytest.raises(ImportError, match=re.escape("Table.from_parquet needs pyarrow: pip install 'hmplot[arrow]'.")):
        hm.Table.from_parquet("data.parquet")


def _netcdf_dataset():
    """A small CF dataset: packed temperatures with a missing cell, a noleap time with bounds,
    latitudes (descending) with bounds."""
    xr = pytest.importorskip("xarray")
    cftime = pytest.importorskip("cftime")
    time = xr.date_range("2001-01-01", periods=3, freq="MS", calendar="noleap", use_cftime=True)
    ends = [*time[1:], cftime.DatetimeNoLeap(2001, 4, 1)]
    values = np.arange(27, dtype=float).reshape(3, 3, 3) + 250
    values[0, 0, 0] = np.nan
    return xr.Dataset(
        {"tas": (("time", "lat", "lon"), values, {"long_name": "Air temperature", "units": "K"}),
         "time_bnds": (("time", "bnds"), np.array(list(zip(time, ends)))),
         "lat_bnds": (("lat", "bnds"), np.array([[90, 30], [30, -30], [-30, -90]], dtype=float))},
        coords={"time": ("time", time, {"bounds": "time_bnds"}),
                "lat": ("lat", [60.0, 0.0, -60.0], {"long_name": "latitude", "units": "degrees_north", "bounds": "lat_bnds"}),
                "lon": [0.0, 120.0, 240.0]})


@pytest.mark.parametrize("format", ["NETCDF4", "NETCDF3_64BIT"])
def test_table_from_netcdf_is_a_grid_table(tmp_path, format):
    """TODO 48.6: packed values, fill values and a noleap calendar decode through xarray; the
    coordinates travel once, with CF bounds as edges; long names and units name the columns."""
    pytest.importorskip("netCDF4")
    path = tmp_path / "tas.nc"
    _netcdf_dataset().to_netcdf(path, format=format, encoding={
        "tas": {"dtype": "int16", "scale_factor": 0.1, "add_offset": 250.0, "_FillValue": -32767},
        "time": {"units": "days since 2001-01-01", "calendar": "noleap"},
        "time_bnds": {"units": "days since 2001-01-01", "calendar": "noleap"}})
    table = hm.Table.from_netcdf(path)
    assert list(table.columns) == ["tas"] and table.grid.shape == (3, 3, 3)
    assert table.column_names() == ["tas", "time", "lat", "lon"]
    tas = np.frombuffer(table.columns["tas"].payload, "<f4")
    assert np.isnan(tas[0]) and tas[1] == pytest.approx(251) and table.columns["tas"].label == "Air temperature (K)"
    time, lat, lon = table.grid.dims
    # Every noleap date exists in the Gregorian calendar: the times are datetimes.
    assert time.coords.dtype == "int64" and time.coords.logical_type == "datetime"
    assert np.frombuffer(time.edges.payload, "<i8")[-1] == np.datetime64("2001-04-01", "us").astype("int64")
    assert list(np.frombuffer(lat.edges.payload, "<f4")) == [90, 30, -30, -90]
    assert lat.coords.label == "latitude (degrees_north)" and lon.edges is None
    # hm.Table(ds) points to from_xarray; the snapshot carries the grid by column references.
    import xarray as xr

    with pytest.raises(TypeError, match=re.escape("use hm.Table.from_xarray(ds)")):
        hm.Table(xr.open_dataset(path))
    with hm.Plot(data=table) as plot:
        hm.Heatmap(fill="tas")
    state, columns = plot._scene()._snapshot()
    grid = state["tables"][table.id]["grid"]
    assert [dim["name"] for dim in grid["dims"]] == ["time", "lat", "lon"]
    assert {grid["dims"][0]["coords"]["$column"], grid["dims"][1]["edges"]["$column"]} <= set(columns)
    assert state["columns"][table.columns["tas"].id]["label"] == "Air temperature (K)"
    # An HTML export keeps the coordinates with the table.
    from hmplot.exporter import _html_payload

    assert grid["dims"][1]["edges"]["$column"] in _html_payload(plot)[0]["state"]["columns"]


def test_from_xarray_model_calendars_curvilinear_grids_and_updates():
    """TODO 48.6: 360_day times stay days since their reference date, with a warning; 2-D
    latitude and longitude become a curvilinear grid's positions; update_columns keeps the grid."""
    xr = pytest.importorskip("xarray")
    pytest.importorskip("cftime")
    time = xr.date_range("2001-01-01", periods=2, freq="MS", calendar="360_day", use_cftime=True)
    ds = xr.Dataset({"pr": (("time", "x"), np.ones((2, 3)))}, coords={"time": time, "x": [0.0, 1.0, 2.0]})
    ds.time.encoding["units"] = "days since 2000-01-01"
    with pytest.warns(UserWarning, match=re.escape('ds.convert_calendar("standard", align_on="year")')):
        table = hm.Table.from_xarray(ds)
    time = table.grid.dims[0].coords
    assert list(np.frombuffer(time.payload, "<f4")) == [360, 390]
    assert time.descriptor()["calendar"] == "360_day" and time.calendar_units == "days since 2000-01-01"
    assert time.label == "time (360_day calendar)"
    y, x = np.meshgrid(np.arange(3), np.arange(4), indexing="ij")
    curvilinear = xr.Dataset({"sst": (("y", "x"), np.random.default_rng(1).random((3, 4)))},
                             coords={"lat": (("y", "x"), 50 + y + 0.1 * x, {"standard_name": "latitude"}),
                                     "lon": (("x", "y"), (10 + x + 0.2 * y).T, {"standard_name": "longitude"})})
    table = hm.Table.from_xarray(curvilinear)
    positions = table.grid.positions
    assert positions["dims"] == ("y", "x") and (positions["x"], positions["y"]) == ("lon", "lat")
    # Given over (x, y), longitude is sent in the grid's (y, x) order.
    assert list(np.frombuffer(positions["columns"]["lon"].payload, "<f4")[:5]) == pytest.approx([10, 11, 12, 13, 10.2])
    assert table.column_names() == ["sst", "y", "x", "lat", "lon"]
    table.update_columns(sst=np.zeros(12))
    assert table.grid is not None and table.version == 2
    with pytest.raises(ValueError, match="lat is a coordinate of the grid table"):
        table.update_columns(lat=np.zeros(12))
    table.replace({"a": [1, 2]})
    assert table.grid is None


def test_from_xarray_refusals(monkeypatch):
    """TODO 48.6: variables of different dimensions, unsorted coordinates, and variables larger
    than the GPU's storage-buffer limit are refused with what to do instead."""
    xr = pytest.importorskip("xarray")
    from hmplot import netcdf

    ds = xr.Dataset({"tas": (("time", "lat"), np.ones((2, 3))), "orog": (("lat",), np.ones(3))},
                    coords={"lat": [0.0, 1.0, 2.0]})
    with pytest.raises(ValueError, match=re.escape("different dimensions: tas (time, lat), orog (lat)")):
        hm.Table.from_xarray(ds)
    assert hm.Table.from_xarray(ds, variables="orog").grid.shape == (3,)
    with pytest.raises(ValueError, match=re.escape('sort them first (ds.sortby("lat"))')):
        hm.Table.from_xarray(ds.assign_coords(lat=[0.0, 2.0, 1.0]), variables="orog")
    # The limit a view reported, else WebGPU's guaranteed 128 MB.
    monkeypatch.setattr(netcdf, "_reported", {"view": 16})
    with pytest.raises(ValueError, match=r"6 cells \(time 2 x lat 3; 24 bytes as float32\), more than the GPU's "
                                         r"storage-buffer limit \(16 bytes\)\. Select less before loading, with \.sel"):
        hm.Table.from_xarray(ds, variables="tas")
    monkeypatch.setattr(netcdf, "_reported", {})
    assert netcdf.buffer_limit() == 128 * 1024 * 1024


def _series_dataset(steps=5):
    xr = pytest.importorskip("xarray")
    values = np.arange(steps * 6, dtype=float).reshape(steps, 2, 3)
    return xr.Dataset({"sst": (("time", "lat", "lon"), values, {"units": "degC"})},
                      coords={"time": np.arange(steps) * 10.0, "lat": [10.0, -10.0], "lon": [0.0, 1.0, 2.0]})


def _streamed(table):
    with hm.Scene() as scene:
        playback = hm.Playback(name="month", min=0, max=table.size - 1, step=1)
        with hm.Plot(data=table):
            hm.Heatmap(fill="sst")
    scene._views["v"] = {"ready": True}
    sequence = iter(range(1, 1000))

    def send(**message):
        scene._receive({"type": "input", "scene": scene.id, "view": "v", "revision": scene.revision,
                        "target": playback.id, "sequence": next(sequence), **message}, [])
    return scene, send


def test_stream_shows_the_slice_at_its_input():
    """TODO 48.7: hm.stream keeps the dataset in Python and replaces the table's variables with
    the slice at the input's value; the coordinates are sent once; a playing input loads the next
    slice ahead; an HTML export carries the slice showing."""
    from hmplot.exporter import _html_payload

    ds = _series_dataset(10)
    table = hm.stream(ds, dim="time", at=hm.input.month)
    assert (table.size, table.index, table.grid.shape) == (10, 0, (2, 3)) and list(table.coords[:3]) == [0, 10, 20]
    scene, send = _streamed(table)
    sst = lambda: np.frombuffer(table.columns["sst"].payload, "<f4")
    first, revision = scene._snapshot()[0], scene.revision
    send(value=2.6)
    assert table.index == 3 and list(sst()) == list(ds.sst[3].values.ravel()) and scene.revision == revision + 1
    second = scene._snapshot()[0]
    assert second["tables"][table.id]["grid"] == first["tables"][table.id]["grid"]
    assert second["tables"][table.id]["columns"] != first["tables"][table.id]["columns"]
    # Playing: the next slice is loaded ahead, and shown from the cache when the input gets there.
    send(playing=True)
    assert 4 in table._cache
    send(value=4)
    assert table.index == 4 and 5 in table._cache
    send(value=0)
    assert table.index == 0 and list(sst()) == list(ds.sst[0].values.ravel())
    exported = _html_payload(scene)[0]["state"]["tables"][table.id]["columns"]["sst"]["$column"]
    assert exported == table.columns["sst"].id
    # by="value": the nearest coordinate.
    near = hm.stream(ds, dim="time", at="month", by="value")
    _, send = _streamed(near)
    send(value=26)
    assert near.index == 3
    with pytest.raises(ValueError, match="no dimension 'depth'"):
        hm.stream(ds, dim="depth", at=hm.input.month)


async def test_stream_loads_off_the_event_loop_and_the_latest_value_wins():
    """TODO 48.7: slices load on a worker thread; values that arrive while one loads replace each
    other, so only the newest is loaded next."""
    import time

    ds = _series_dataset()
    table = hm.stream(ds, dim="time", at=hm.input.month)
    scene, send = _streamed(table)
    loads, load = [], table._load
    table._load = lambda index: (loads.append(index), time.sleep(0.05), load(index))[2]
    for value in (1, 2, 3):
        send(value=value)
    assert table.index == 0 and table._loading == 1
    for _ in range(100):
        if table.index == 3:
            break
        await asyncio.sleep(0.01)
    assert table.index == 3 and loads == [1, 3]


def test_statistics_nodes_send_their_settings():
    """TODO 47: the statistics transforms and charts are registry nodes: their settings travel as
    props, and keywords they do not take are refused."""
    data = {"x": [1.0, 2.0, 3.0, 4.0], "y": [2.0, 3.0, 5.0, 4.0], "g": ["a", "b", "a", "b"]}
    with hm.Scene() as scene:
        with hm.Plot(data=data):
            hm.charts.Smooth(x="x", y="y", method="poly", order=2, band=0.9)
            hm.charts.Ecdf(x="y", by="g", complementary=True, normalize="count")
            hm.charts.DensityBands(x="x", y="y", thresholds=[0.1, 0.2])
            with hm.Voronoi(x="x", y="y", extent=[[0, 0], [5, 6]]):
                hm.Polygon(fill="g", outline_width=1)
            with hm.Hull(x="x", y="y", by="g"):
                hm.Polygon(fill="g")
            with hm.Delaunay(x="x", y="y"):
                hm.Segments(start="start", end="end")
            with hm.Regression(x="x", y="y", method="exp", samples=20):
                hm.Line(x="x", y="y")
    nodes = {n["kind"]: n["props"] for n in _flatten_nodes(scene._snapshot()[0]["root"])}
    assert nodes["Smooth"] == {"x": "x", "y": "y", "method": "poly", "order": 2, "band": 0.9}
    assert nodes["Ecdf"]["normalize"] == "count" and nodes["DensityBands"]["thresholds"] == [0.1, 0.2]
    polygons = [n["props"] for n in _flatten_nodes(scene._snapshot()[0]["root"]) if n["kind"] == "Polygon"]
    assert nodes["Voronoi"]["extent"] == [[0, 0], [5, 6]] and polygons[0]["outlineWidth"] == 1
    assert nodes["Regression"]["samples"] == 20
    with pytest.raises(TypeError, match="Voronoi: unknown property 'thresholds'"):
        hm.Voronoi(x="x", y="y", thresholds=3)
    with pytest.warns(FutureWarning, match="DensityContour.mode is deprecated and will be removed: .* use hm.charts.DensityBands"):
        hm.charts.DensityContour(x="x", y="y", mode="bands")
    # An input's mode is an expression: it warns too, and builds.
    with pytest.warns(FutureWarning, match="DensityContour.mode is deprecated"):
        hm.charts.DensityContour(x="x", y="y", mode=hm.input("mode"))


def _flatten_nodes(node):
    yield node
    for child in node["children"]:
        yield from _flatten_nodes(child)


def test_join_sends_its_table_and_keys():
    """TODO 43: hm.Join's data= is a Table in the snapshot; keys and names travel as props."""
    pd = pytest.importorskip("pandas")

    airports = pd.DataFrame({"airport": ["SFO", "JFK"], "region": ["West", "East"]})
    with hm.Scene() as scene:
        with hm.Data({"airport": ["SFO", "JFK", "SFO"], "delay": [1.0, 2.0, 3.0]}):
            with hm.Join(data=airports, on="airport", fields=["region"], as_={"region": "area"}, how="inner"):
                with hm.Plot():
                    hm.Points(x="delay", y="delay", fill="area")
    state, _ = scene._snapshot()
    [join] = [n for n in _walk(state["root"]) if n["kind"] == "Join"]
    table = join["props"]["data"]["$table"]
    assert set(state["tables"][table]["columns"]) == {"airport", "region", "index"}
    assert (join["props"]["on"], join["props"]["fields"], join["props"]["as"], join["props"]["how"]) == \
        ("airport", ["region"], {"region": "area"}, "inner")
    assert hm.Join(data={"k": [1]}, left_on=["a"], right_on=["k"]).props["leftOn"] == ["a"]
    with pytest.raises(TypeError, match='Join how must be "left" or "inner", not \'outer\''):
        hm.Join(data={"k": [1]}, on="k", how="outer")
    with pytest.raises(ValueError, match="Join: the joined table has no column 'code'"):
        hm.Join(data={"k": [1]}, on="code")
    with pytest.raises(TypeError, match="requires on="):
        hm.Join(data={"k": [1]}, left_on="k")


def _walk(node):
    yield node
    for child in node.get("children", []):
        yield from _walk(child)


def test_graph_endpoint_is_not_a_component_reference():
    graph = hm.GraphData(nodes={"id": [1, 2]}, edges={"from": [1], "to": [2]}, source="from", target="to")
    assert graph.props["target"] == "to" and "for" not in graph.props
    with pytest.raises(TypeError, match="hm.GraphData"):
        hm.Force(source="from")


def test_capabilities_and_bounded_pending_updates():
    table = hm.Table({"x": [1, 2]})
    with hm.Scene() as scene:
        with hm.Data(table):
            with hm.Plot():
                hm.Points(x="x", y=[1, 2])
    widget = scene._widget_instance()
    assert not widget.columns
    view = "test-view"
    widget._receive(
        widget,
        {
            "type": "capabilities",
            "scene": scene.id,
            "view": view,
            "ready": True,
            "protocol": 1,
            "library": hm.core.REGISTRY["library"],
        },
        [],
    )
    first = widget.state["revision"]
    assert widget.inflight == first
    initial = set(widget.resources)
    for i in range(25):
        table.update_columns(x=[i, i + 1])
    assert set(widget.resources) == initial
    assert widget.waiting[0]["revision"] == scene.revision
    assert len(scene._states) <= 2
    widget._receive(
        widget, {"type": "ack", "scene": scene.id, "view": view, "revision": first}, []
    )
    assert widget.state["revision"] == scene.revision
    widget._receive(
        widget,
        {"type": "ack", "scene": scene.id, "view": view, "revision": scene.revision},
        [],
    )
    assert not widget.retired
    scene.close()


# TODO 71: a notebook view without WebGPU gets a static image the kernel draws headlessly, and
# HMPLOT_NOTEBOOK_SVG puts the scene's SVG in the display's output.
def _snapshot_browser():
    """Skip where the snapshot worker's headless Chrome cannot start (the headless exports' rule)."""
    try:
        hm.exporter.SNAPSHOTS.call(lambda session: session._ensure_browser())
    except Exception as error:
        pytest.skip(f"headless export unavailable: {error}")


def _wait_for(found, timeout=120):
    import time

    deadline = time.monotonic() + timeout
    while not (value := found()):
        assert time.monotonic() < deadline, "timed out"
        time.sleep(0.05)
    return value


def _snapshot_scene():
    with hm.Scene() as scene:
        with hm.Plot(title="Penguins", height=200, axes2d=True):
            points = hm.Points(x=[0.0, 1.0, 2.0], y=[1.0, 0.0, 2.0], fill="#2468a0", size=10)
    return scene, points


def _no_chrome(monkeypatch):
    """A fresh snapshot worker that finds no browser; returns the download= of each search."""
    from hmplot import chrome

    calls = []

    def missing(download=True):
        calls.append(download)
        raise RuntimeError(chrome._missing_message())

    monkeypatch.setattr(hm.exporter, "SNAPSHOTS", hm.exporter._Snapshots())
    monkeypatch.setattr(chrome, "find_chrome", missing)
    return calls


def test_a_view_without_webgpu_gets_a_static_image_of_each_revision(monkeypatch):
    import time

    _snapshot_browser()
    scene, points = _snapshot_scene()
    widget = scene._widget_instance()
    sent = []
    monkeypatch.setattr(widget, "send", lambda content, buffers=None: sent.append((content, buffers)))
    snapshots = lambda: [item for item in sent if item[0]["type"] == "snapshot"]
    widget._receive(widget, {"type": "snapshot_request", "protocol": 1, "scene": scene.id, "view": "plain", "width": 500}, [])
    [(content, buffers)] = _wait_for(snapshots)
    assert (content["view"], content["revision"], content.get("error")) == ("plain", scene.revision, None)
    svg = buffers[0].decode()
    # The view's width, the plot's title, and its generated description (the image's alt text).
    assert hm.exporter._svg_size(svg)[0] == "500px"
    assert re.search(r"^<svg[^>]*><title>Penguins</title><desc>Scatter plot\. x from -0\.1 to 2\.1, y from 0 to 2\.</desc>", svg)
    # A burst of updates draws once, the newest revision.
    sent.clear()
    for size in (11, 12, 13):
        points.update(size=size)
    points.update(fill="#c73b2b")
    [(content, buffers)] = _wait_for(snapshots)
    time.sleep(0.6)
    assert len(snapshots()) == 1 and content["revision"] == scene.revision
    assert b"#c73b2b" in buffers[0] and b"#2468a0" not in buffers[0]
    scene.close()


def test_a_view_without_webgpu_or_chrome_is_told_what_to_install(monkeypatch):
    import time

    calls = _no_chrome(monkeypatch)
    scene, points = _snapshot_scene()
    widget = scene._widget_instance()
    sent = []
    monkeypatch.setattr(widget, "send", lambda content, buffers=None: sent.append((content, buffers)))
    widget._receive(widget, {"type": "snapshot_request", "protocol": 1, "scene": scene.id, "view": "plain", "width": None}, [])
    [(content, buffers)] = _wait_for(lambda: sent)
    assert content["type"] == "snapshot" and buffers == []
    assert content["error"].startswith("hmplot exports need Chrome, Edge or Chromium, and found none.")
    assert "hmplot install-chrome" in content["error"]
    # The display never downloads Chrome for Testing.
    assert calls == [False]
    # A disposed view is drawn no more.
    widget._receive(widget, {"type": "dispose", "protocol": 1, "scene": scene.id, "view": "plain"}, [])
    points.update(size=11)
    time.sleep(0.5)
    assert len(sent) == 1
    scene.close()


def test_a_view_exporting_html_gets_the_standalone_runtime_from_the_kernel(monkeypatch):
    # The page embeds the standalone runtime, which the widget's bundle does not contain and a
    # notebook front end cannot reach on disk: the kernel sends its copy.
    from pathlib import Path

    scene, _ = _snapshot_scene()
    widget = scene._widget_instance()
    sent = []
    monkeypatch.setattr(widget, "send", lambda content, buffers=None: sent.append((content, buffers)))
    widget._receive(widget, {"type": "standalone_request", "protocol": 1, "scene": scene.id, "view": "v", "request": "r"}, [])
    [(content, buffers)] = sent
    assert (content["type"], content["view"], content["request"], content.get("error")) == ("standalone", "v", "r", None)
    assert buffers == [(Path(hm.__file__).with_name("static") / "standalone.js").read_bytes()]
    scene.close()


def _html_view(scene, refuse=None):
    """A ready view answering export_html with a page, or with the view's refusal of a page of
    ``refuse`` bytes; returns the commands it got."""
    commands = []

    class Transport:
        def send(self, message):
            if message.get("type") != "command":
                return
            commands.append(message)
            reply = {"scene": scene.id, "request": message["request"], "revision": scene.revision}
            if refuse:
                limit = message["args"]["maxBytes"]
                scene._receive({**reply, "type": "error", "code": "bridge.message_too_large",
                                "message": f"The export_html result is {refuse} bytes, more than the {limit} this view may send to the kernel.",
                                "diagnostic": {"details": {"bytes": refuse, "maxBytes": limit}}}, [])
            else:
                page = b'<script type="module" id="hmplot-runtime">/* HMPlot runtime */\nconst payload=1;</script>'
                scene._receive({**reply, "type": "result"}, [page])

    scene._widget = Transport()
    scene._views["v"] = {"ready": True, "revision": scene.revision}
    return commands


@pytest.mark.asyncio
async def test_a_notebook_html_export_too_large_to_send_to_the_kernel_goes_headless(monkeypatch, tmp_path):
    # Jupyter's server closes the connection on a message over 10 MiB, and the page comes from the
    # view as one: a page whose data already pass the limit is exported headlessly at once; the view
    # measures the rest (the snapshot) and refuses to send a page over it. Small pages come from
    # the view as before.
    import json
    from hmplot import exporter

    headless = []
    monkeypatch.setattr(exporter, "_notebook_html", lambda *args, **kwargs: headless.append((*args, kwargs)) or b"headless page")
    scene, _ = _snapshot_scene()
    commands = _html_view(scene)
    # Python counts the data and state as the page's JSON holds them.
    assert exporter._html_data_bytes(scene) == len(json.dumps(exporter._html_payload(scene)[0], ensure_ascii=False, separators=(",", ":")).encode())
    page = await scene.export_html(tmp_path / "small.html", timeout=1)
    runtime = ('<script type="module" id="hmplot-runtime">' + exporter._standalone_source()).encode("utf-8")
    assert page == runtime + b"\nconst payload=1;</script>"
    assert (tmp_path / "small.html").read_bytes() == page and headless == []
    [command] = commands
    assert command["args"]["maxBytes"] == exporter._NOTEBOOK_PAGE_LIMIT == 10 * 1024 * 1024 - 64 * 1024
    assert command["args"]["page"] == {"maxWidth": 960, "margin": 24}

    monkeypatch.setattr(exporter, "_NOTEBOOK_PAGE_LIMIT", exporter._html_data_bytes(scene) - 1)
    with pytest.warns(RuntimeWarning, match=r"export_html: the page holds 0\.0 MiB of data, more than a notebook can send to the kernel \(10 MiB\), so it was exported headlessly"):
        assert await scene.export_html(tmp_path / "data.html", snapshot="png", page=False, timeout=1) == b"headless page"
    # The page's layout goes along (it was lost: page=False came out with the default).
    assert len(commands) == 1 and headless == [(scene, tmp_path / "data.html", "png", "the page holds 0.0 MiB of data", {"page": False})]

    monkeypatch.undo()
    monkeypatch.setattr(exporter, "_notebook_html", lambda *args, **kwargs: headless.append((*args, kwargs)) or b"headless page")
    headless.clear()
    commands = _html_view(scene, refuse=11 * 1048576)
    with pytest.warns(RuntimeWarning, match=r"the page is 11\.0 MiB without the runtime, more than a notebook can send"):
        assert await scene.export_html(timeout=1) == b"headless page"
    assert len(commands) == 1 and headless == [(scene, None, "svg", "the page is 11.0 MiB without the runtime", {"page": True})]
    # The view's refusal is no error of the scene's.
    assert scene.error is None


@pytest.mark.asyncio
async def test_a_notebook_html_export_too_large_to_send_and_no_browser_says_what_to_do(monkeypatch):
    from hmplot import exporter

    scene, _ = _snapshot_scene()
    commands = _html_view(scene)
    _no_chrome(monkeypatch)
    monkeypatch.setattr(exporter, "_NOTEBOOK_PAGE_LIMIT", 100)
    with pytest.raises(RuntimeError, match=r"(?s)export_html: the page holds 0\.0 MiB of data, over the 10 MiB a notebook can send "
                       r"from the browser to the kernel.*hm\.export_html\(\) has no such limit, but it draws the page's snapshot "
                       r"in a headless browser, which did not start: hmplot exports need Chrome.*call hm\.export_html\(scene, path\); "
                       r"or export a smaller scene\. snapshot=False writes a page without a snapshot, which needs no browser\."):
        await scene.export_html(timeout=1)
    # Without a snapshot the headless page needs no browser.
    with pytest.warns(RuntimeWarning, match="exported headlessly"):
        page = await scene.export_html(snapshot=False, timeout=1)
    runtime = ('<script type="module" id="hmplot-runtime">' + exporter._standalone_source()).encode("utf-8")
    assert b'<body><div id="hmplot-root"></div>' in page and runtime in page
    assert commands == [] and scene.last_export_report["snapshot"] is None


def test_an_html_export_lays_its_page_out_unless_page_is_false():
    # TODO 132.6: the page has a margin (halved on a narrow screen) and centers its content at most
    # 960 px wide; page= sets them, and page=False makes a bare page.
    scene, _ = _snapshot_scene()
    style = lambda **page: re.search(rb"<style>(.*?)</style>", hm.export_html(scene, snapshot=False, **page), re.S).group(1)
    assert b"--hmplot-margin:24px;" in style() and b"max-width:calc(960px + 2 * var(--hmplot-margin));margin:0 auto;" in style()
    assert b"@media (max-width:600px){body{--hmplot-margin:12px}}" in style()
    assert b"max-width:calc(1200px" in style(page={"max_width": 1200})
    bare = style(page=False)
    assert b"--hmplot-margin:0px;" in bare and b"max-width:calc" not in bare and b"@media" not in bare
    assert b"font-family:system-ui,sans-serif;color:#30343b" in bare
    with pytest.raises(ValueError, match=r"HTML export page must be True, False or a dict of max_width and margin"):
        hm.export_html(scene, snapshot=False, page={"width": 800})
    # A fixed-width plot wider than the maximum widens the page rather than being clipped.
    with hm.Scene() as wide:
        with hm.Plot(width=1200, height=200, axes2d=True):
            hm.Points(x=[0.0], y=[0.0])
    assert b"max-width:calc(1200px" in re.search(rb"<style>(.*?)</style>", hm.export_html(wide, snapshot=False), re.S).group(1)


def test_hmplot_notebook_svg_puts_the_scene_svg_beside_the_widget(monkeypatch):
    scene, points = _snapshot_scene()
    data, _ = scene._repr_mimebundle_()
    assert "application/vnd.jupyter.widget-view+json" in data and "image/svg+xml" not in data
    monkeypatch.setenv("HMPLOT_NOTEBOOK_SVG", "1")
    with monkeypatch.context() as patched:
        _no_chrome(patched)
        with pytest.warns(RuntimeWarning, match="The notebook output has no SVG of the scene: hmplot exports need Chrome"):
            data, _ = scene._repr_mimebundle_()
        assert "image/svg+xml" not in data and "application/vnd.jupyter.widget-view+json" in data
    _snapshot_browser()
    # Displaying a node displays its scene.
    data, _ = points._repr_mimebundle_()
    assert "application/vnd.jupyter.widget-view+json" in data
    svg = data["image/svg+xml"]
    assert hm.exporter._svg_size(svg)[0] == f"{hm.exporter.DISPLAY_WIDTH}px" and "<title>Penguins</title>" in svg
    data, _ = scene._repr_mimebundle_(exclude=["image/svg+xml"])
    assert "image/svg+xml" not in data
    scene.close()


def test_dictionary_categories_preserve_identity():
    t = hm.Table(
        {"id": {"codes": [0, 1, -1], "categories": [True, 1]}, "mixed": [True, 1, None]}
    )
    assert t.columns["id"].categories == (True, 1)
    assert t.columns["mixed"].categories == (True, 1)
    with pytest.raises(ValueError):
        hm.Table({"id": {"codes": [2], "categories": ["a"]}})


def test_typed_dataframe_indexes_and_expression_serialization():
    pd = pytest.importorskip("pandas")

    frame = pd.DataFrame({
        "when": pd.to_datetime(["2024-01-01", "2024-01-02"], utc=True),
        "level": pd.Categorical(["low", "high"], categories=["low", "high"], ordered=True),
        "value": [2.0, 3.0],
    }, index=pd.Index([10, 11], name="sample"))
    table = hm.Table(frame)
    assert table.columns["when"].logical_type == "datetime"
    # The dtype's own unit (pandas 3: microseconds), not "ns" over microseconds (TODO 69.6).
    assert table.columns["when"].unit == frame["when"].dtype.unit
    assert table.columns["level"].logical_type == "ordinal"
    assert table.columns["level"].categories == ("low", "high")
    assert table.columns["sample"].dtype == "int64"

    with hm.Plot(data=table) as plot:
        with hm.Calculate(squared=hm.square("value"), shifted=hm.col.value + 1):
            hm.Points(x="shifted", y="squared", size=hm.where("@hovered", 18, 12), hover=True, respond=False)
    state, _ = plot._scene()._snapshot()
    calculate = next(node for node in hm.core.flatten(state["root"]) if node["kind"] == "Calculate")
    assert calculate["props"]["columns"]["squared"]["$expression"]["op"] == "square"
    with pytest.raises(TypeError, match="cannot be converted to bool"):
        bool((hm.col.value > 1) & (hm.col.value < 4))


def test_schema_overrides_and_typed_empty_columns():
    table = hm.Table({"condition": [1, 2, 1]}, schema={"condition": "categorical"})
    assert table.columns["condition"].categories == (1, 2)
    empty = hm.typed_column([], type="numeric")
    assert empty.shape == (0,) and empty.logical_type == "numeric"
    with pytest.raises(ValueError, match=r"needs its type: give it one in the table.s schema, as schema="):
        hm.Table({"empty": []})


def test_geometry_has_resource_identity():
    geometry = {"type": "Point", "coordinates": [0, 0]}
    with hm.Plot() as plot:
        mark = hm.GeoJSON(data=geometry)
    scene = plot._scene()
    state, columns = scene._snapshot()
    resource = next(iter(columns.values()))
    assert resource.structured == geometry
    assert "structured" not in state["columns"][resource.id]
    mark.update(opacity=0.5)
    assert next(iter(scene._snapshot()[1])) == resource.id


@pytest.mark.asyncio
async def test_async_callback_dispatch():
    import threading

    done = asyncio.Event()
    with hm.Scene() as scene:
        with hm.Plot():
            point = hm.Points(position=[[0, 0]])

    async def clicked(event):
        assert event.source_index == 0
        done.set()

    point.on_click(clicked)
    scene._views["v"] = {"ready": True}
    thread = threading.Thread(
        target=lambda: scene._receive(
            {
                "type": "event",
                "scene": scene.id,
                "revision": scene.revision,
                "view": "v",
                "target": point.id,
                "event": "click",
                "payload": {"source_index": 0},
            },
            [],
        )
    )
    thread.start()
    thread.join()
    await asyncio.wait_for(done.wait(), 1)


def test_disposed_views_cannot_deliver_events():
    with hm.Scene() as scene:
        with hm.Plot():
            points = hm.Points(position=[[0, 0]])
    seen = []
    points.on_click(lambda event: seen.append(event.source_index))
    event = {
        "type": "event",
        "scene": scene.id,
        "view": "closed",
        "revision": scene.revision,
        "target": points.id,
        "event": "click",
        "payload": {"source_index": 0},
    }
    scene._receive(event, [])
    assert seen == []
    scene._views["closed"] = {"ready": True}
    scene._receive(event, [])
    assert seen == [0]
    scene._receive({"type": "dispose", "scene": scene.id, "view": "closed"}, [])
    scene._receive(event, [])
    assert seen == [0]


def test_data_shortcuts_axis_composition_and_histogram():
    table = hm.Table({'x': [0, 1, 2], 'y': [10, 20, 30]})
    with hm.Plot(data=table) as view:
        with hm.Frame(x={'domain': [0, 2]}, y={'side': 'right'}) as axis:
            line = hm.Line(x='x', y='y')
    assert view.props['data'] is table
    assert line.parent is axis and axis.parent is view
    state, columns = view._scene()._snapshot()
    assert len(columns) == 2
    with hm.Facet(data=table, column='x') as facets:
        with hm.Plot(axes2d=True):
            histogram = hm.charts.Histogram(x='y', bins=4, normalization='density')
    histogram.update(bins=8)
    assert histogram.props['bins'] == 8
    assert facets.props['data'] is table


def test_plot_allows_direct_marks_and_nested_frames():
    with hm.Plot():
        hm.Line(position=[[0, 0], [1, 1]])
    with hm.Plot() as plot:
        with hm.Frame() as frame:
            with hm.Frame() as inner:
                hm.Line(position=[[0, 0], [1, 1]])
    assert frame.parent is plot
    assert inner.parent is frame


def test_frame_is_the_only_coordinate_component():
    # R2.0: Axis and Axes are gone; Frame is the coordinate component.
    assert not hasattr(hm, "Axis") and not hasattr(hm, "Axes")


def test_text_label_properties():
    with hm.Plot() as plot:
        label = hm.Text3D(text="Alder", position=[2, 8, 0], size=4)
    assert label.props["text"] == "Alder"
    label.update(text="Birch", visible=False)
    assert label.props["text"] == "Birch"
    assert label.props["visible"] is False


def test_statistical_transforms_staple_marks_and_atomic_loading():
    table = hm.Table({"group": ["A", "A", "B", "B"], "value": [1, 2, 3, 4]})
    with hm.Plot(data=table, loading="atomic", axes2d=True) as plot:
        with hm.Density(x="value", by="group", resolution=64) as density:
            hm.Line(x="x", y="density", color="group")
    assert plot.props["loading"] == "atomic"
    assert density.parent is plot
    # TODO 137.3: a quantile is a reducer; the Quantile, JoinAggregate, ECDF and Shuffle
    # transforms are gone, each an error naming what replaces it.
    p90 = hm.quantile("value", 0.9, by="group", where="@selected")
    assert (p90.op, p90.args) == ("quantile", ("value", {"$expression_options": {"by": "group", "p": 0.9}}, "@selected"))
    with pytest.raises(ValueError, match="quantile needs p"):
        hm.quantile("value", 2)
    with pytest.raises(TypeError, match="quantile needs p"):
        hm.quantile("value", "0.5")
    assert hm.quantile("value", np.float32(0.5)).args[1] == {"$expression_options": {"p": 0.5}}
    for name, replacement in [("Quantile", "hm.quantile"), ("JoinAggregate", "by=\"g\""),
                              ("ECDF", "hm.charts.Ecdf"), ("Shuffle", 'order="random"')]:
        with pytest.raises(AttributeError, match=f"hm.{name} was removed.*{re.escape(replacement)}"):
            getattr(hm, name)
    with hm.Data(table):
        with hm.Sample(order="random") as shuffled:
            with hm.Plot(axes2d=True):
                hm.Line(x="value", y="value")
    assert shuffled.props["order"] == "random"
    with hm.Plot(x={"scale": hm.categorical(domain=["A", "B"])}, data=table):
        assert hm.charts.Violin(x="group", y="value").kind == "Violin"
        assert hm.charts.BoxPlot(x="group", y="value").kind == "BoxPlot"
        assert hm.charts.Swarm(x="group", y="value").kind == "Swarm"
        assert hm.charts.Bar(x="group", y="value").kind == "Bar"


def test_stack_offset_and_order_round_trip_and_examples_build():
    """Stack offsets and orders (TODO 39.7): keywords, snapshot, update, and examples 70."""
    import runpy
    from pathlib import Path

    with pytest.raises(AttributeError, match=r"hm.Area"):
        getattr(hm, "Ribbon")
    with pytest.raises(TypeError, match="pass lower instead of baseline"):
        hm.Area(x=[0, 1], upper=[2, 3], baseline=0)
    horizontal = hm.Area(y=[0, 1], lower=0, upper=[2, 3], orientation="horizontal")
    assert horizontal.props["orientation"] == "horizontal" and horizontal.props["lower"] == 0
    assert horizontal.props["y"].shape == horizontal.props["upper"].shape == (2,)
    with hm.Scene() as scene:
        with hm.Plot(data={"t": [0, 0, 1, 1], "g": ["a", "b", "a", "b"], "v": [1, 2, 3, 4]}):
            with hm.Stack(x="t", y="v", series="g", offset="wiggle", order="insideOut") as stack:
                hm.Area(x="t", upper="y1", lower="y0", fill="g", series="g")
    def find(node):
        return node if node["kind"] == "Stack" else next(filter(None, map(find, node.get("children", []))), None)
    props = find(scene._snapshot()[0]["root"])["props"]
    assert (props["offset"], props["order"]) == ("wiggle", "insideOut")
    stack.update(offset="expand", order=["b", "a"])
    assert (stack.props["offset"], stack.props["order"]) == ("expand", ["b", "a"])
    examples = Path(__file__).resolve().parents[1] / "examples"
    for name, offset in (("70_streamgraph.py", "wiggle"), ("70_stacked_percent.py", "expand")):
        stack = runpy.run_path(str(examples / name))["plot"].children[0]
        assert stack.kind == "Stack" and stack.props["offset"] == offset


def test_curated_theme_presets_are_fresh_and_scene_ready():
    assert hm.themes.names() == (
        "hmplot", "minimal", "ink", "paper", "presentation", "colorblind", "dark", "538",
        "finance-terminal", "pastel", "graph", "sea", "sunset", "ggplot",
        "seaborn-dark", "notebook", "graphing-calculator", "observable",
        "wes-anderson", "ghibli", "yellow-glow", "8bit",
        "vaporwave", "blueprint", "bubblegum", "spooky", "treasure-map",
        "bureau", "journal", "bauhaus", "risograph", "tufte",
    )
    paper = hm.themes.paper
    paper["palette"][0] = "#ffffff"
    assert hm.themes.paper["palette"][0] == "#315878"
    with hm.Scene(theme=hm.themes.colorblind) as scene:
        hm.Plot()
    state, _ = scene._snapshot()
    assert state["root"]["props"]["theme"]["name"] == "Colorblind safe"
    custom = hm.create_theme(**hm.themes.presentation)
    assert custom.value["marks"]["Line"]["width"] == 3


def test_data_owned_interaction_resources_and_key_validation():
    with pytest.raises(ValueError, match="unique"):
        hm.Table({"id": ["a", "a"], "x": [1, 2]}, key="id")
    table = hm.Table({"id": ["a", "b"], "x": [1, 2]}, key="id")
    with hm.Scene() as scene:
        with hm.Plot(data=table) as plot:
            hm.Points(x="x", y=[0, 1], select=True, respond=True)
    assert plot.selection is table.selection
    assert plot.brush is table.brush
    state, _ = scene._snapshot()
    descriptor = state["tables"][table.id]
    assert descriptor["key"] == "id"
    assert descriptor["selection"] == {"$selection": table.selection.id}
    assert table.selection.id in state["selections"]


def test_explicit_selection_and_identity_serialize_as_resources():
    selected = hm.selection()
    rows = hm.identity(keys=["first", "second"])
    with hm.Scene() as scene:
        with hm.Plot():
            hm.Points(
                position=[[0, 0], [1, 1]], identity=rows,
                select=selected, respond=selected,
            )
    state, _ = scene._snapshot()
    props = state["root"]["children"][0]["children"][0]["props"]
    assert props["identity"] == {"$identity": rows.id}
    assert props["select"] == {"$selection": selected.id}
    assert rows.id in state["identities"]
    assert rows.selection.id in state["selections"]
    assert selected.id in state["selections"]


def test_selection_resources_are_expression_operands():
    # TODO 139.3: a selection is each row's membership inside an expression.
    focus = hm.selection()
    table = hm.Table({"gene": ["a", "b", "c"], "value": [1, 20, 30]})
    with hm.Scene() as scene:
        with hm.Plot(data=table):
            hm.Points(x="value", y="value", select=focus, opacity=hm.where(focus, 1, 0.15))
            hm.Points(x="value", y="value", size=hm.where(focus & (hm.col.value > 10), 9, 4))
            hm.Filter(where=~focus)
    state, _ = scene._snapshot()
    plot = state["root"]["children"][0]
    first, second, third = plot["children"][:3]
    reference = {"$selection": focus.id}
    assert first["props"]["opacity"] == {"$expression": {"op": "where", "args": [reference, 1, 0.15]}}
    condition = second["props"]["size"]["$expression"]["args"][0]["$expression"]
    assert condition["op"] == "logical_and" and condition["args"][0] == reference
    assert third["props"]["where"] == {"$expression": {"op": "logical_not", "args": [reference]}}
    assert focus.id in state["selections"]
    # (hm.col.value > 10) & focus works from either side; a selection is not a bool.
    assert ((hm.col.value > 10) & focus).args[1] is focus
    assert (focus | focus).op == "logical_or"
    with pytest.raises(TypeError, match="not true or false"):
        bool(focus)


def test_selection_by_a_column_serializes_and_links_tables():
    # TODO 139.6: a selection by value; two tables, each with the column.
    focus = hm.selection(by="gene")
    genes = hm.Table({"gene": ["BRCA1", "TP53"], "length": [10, 20]})
    samples = hm.Table({"gene": ["TP53", "TP53", "BRCA1"], "value": [1, 2, 3]})
    with hm.Scene() as scene:
        with hm.Plot(data=genes):
            hm.Points(x="length", y="length", hover=focus)
        with hm.Plot(data=samples):
            hm.Points(x="value", y="value", opacity=hm.where(focus, 1, 0.2))
    state, _ = scene._snapshot()
    assert state["selections"][focus.id]["by"] == "gene"
    assert "by" not in state["selections"][genes.selection.id]
    with pytest.raises(ValueError, match="one column's name"):
        hm.selection(by=["gene", "sample"])


@pytest.mark.asyncio
async def test_programmatic_selection_uses_browser_command_protocol():
    table = hm.Table({"x": [1, 2]})
    with hm.Scene() as scene:
        with hm.Plot(data=table):
            hm.Points(x="x", y=[0, 1], select=True)
    scene._views["test"] = {"ready": True}
    sent = []

    class Transport:
        def send(self, message):
            sent.append(message)
            scene._receive(
                {
                    "type": "result", "scene": scene.id,
                    "request": message["request"], "value": {"active": True},
                },
                [],
            )

    scene._widget = Transport()
    await table.selection.replace([1], view="test")
    assert sent[-1]["command"] == "selection"
    assert sent[-1]["target"] == table.selection.id
    assert {key: value for key, value in sent[-1]["args"].items() if key != "timeoutMs"} == {
        "operation": "replace", "rows": [1], "owner": table.id,
    }
    assert sent[-1]["args"]["timeoutMs"] > 0
    table.selection._receive(table.id, [1], True)
    state, _ = scene._snapshot()
    assert state["selections"][table.selection.id]["active"] is True
    assert state["selections"][table.selection.id]["owners"] == {table.id: [1]}
    assert state["selections"][table.selection.id]["version"] > 0


def test_continuous_and_ordinal_scale_resources_share_and_update():
    normalizer = hm.normalization(domain=[0, 100])
    color = hm.continuous(normalization=normalizer, colormap="Inferno")
    size = hm.continuous(normalization=normalizer, range=[4, 20])
    classes = hm.ordinal(domain=["low", "middle", "high"], colormap="Viridis")
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [0, 1, 2], "value": [0, 50, 100],
                           "class": ["low", "middle", "high"]}):
            hm.Points(x="x", y="value", fill="value", fill_scale=color,
                             size="value", size_scale=size)
            hm.Points(x="x", y="value", fill="class", fill_scale=classes)
    state, _ = scene._snapshot()
    assert state["normalizations"][normalizer.id]["domain"] == [0.0, 100.0]
    assert state["scales"][color.id]["normalization"] == {"$normalization": normalizer.id}
    assert state["scales"][size.id]["normalization"] == {"$normalization": normalizer.id}
    assert state["scales"][classes.id]["kind"] == "ordinal"
    before = scene.revision
    normalizer.update(domain=[0, 200])
    color.update(colormap="Magma")
    classes.update(domain=["high", "middle", "low"])
    assert scene.revision == before + 3
    updated, _ = scene._snapshot()
    assert updated["normalizations"][normalizer.id]["domain"] == [0.0, 200.0]
    assert updated["scales"][color.id]["colormap"] == "Magma"
    assert updated["scales"][classes.id]["domain"] == ["high", "middle", "low"]
    with pytest.raises(ValueError):
        normalizer.update(domain=[0, 0])
    assert normalizer.domain == [0.0, 200.0]


def test_symlog_and_midpoint_scales_round_trip_and_validate():
    diverging = hm.continuous(transform="symlog", constant=10, midpoint=0, colormap="RdBu")
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [0, 1, 2], "value": [-50, 0, 400]},
                     y={"domain": [-500, 500], "transform": "symlog", "constant": 5}):
            hm.Points(x="x", y="value", fill="value", fill_scale=diverging)
    state, _ = scene._snapshot()
    snapshot = state["normalizations"][diverging.normalization.id]
    assert {key: snapshot[key] for key in ("transform", "constant", "midpoint")} == {
        "transform": "symlog", "constant": 10.0, "midpoint": 0.0}
    plot = state["root"]["children"][0]
    assert plot["props"]["y"] == {"domain": [-500, 500], "transform": "symlog", "constant": 5}
    diverging.normalization.update(midpoint=None)
    assert "midpoint" not in diverging.normalization.snapshot()
    with pytest.raises(ValueError, match=r"Normalization midpoint 20 is outside its domain \[1, 10\]\."):
        hm.continuous(domain=[1, 10], midpoint=20)
    # d3's diverging domain [low, mid, high] is the domain's ends and its midpoint (2026-10-22).
    three = hm.continuous(domain=[-60, 0, 60]).normalization
    assert (three.domain, three.midpoint) == ([-60.0, 60.0], 0.0)
    with pytest.raises(ValueError, match=r"already gives the midpoint"):
        hm.continuous(domain=[-60, 0, 60], midpoint=0)
    colors = hm.continuous(domain=[-60, 0, 60], range=["#2166ac", "#f7f7f7", "#b2182b"])
    assert colors.range is None and colors.colormap is not None
    with pytest.raises(ValueError, match="Normalization constant must be a finite positive number."):
        hm.normalization(transform="symlog", constant=0)
    with pytest.raises(ValueError, match="Configure domain, transform, constant, midpoint"):
        hm.continuous(normalization=hm.normalization(), midpoint=0)
    with pytest.raises(ValueError, match="Unsupported normalization transform: pow"):
        hm.continuous(transform="pow")


def test_joint_map_projections_round_trip_and_example_builds():
    import os
    from pathlib import Path
    with hm.Scene() as scene:
        with hm.Plot(coordinates="spherical", projection="albers", projection_center=[-96, 38.7],
                     parallels=[29.5, 45.5], type="2d"):
            hm.GeoJSON(data={"type": "FeatureCollection", "features": []})
    state, _ = scene._snapshot()
    plot = state["root"]["children"][0]
    assert plot["props"]["projection"] == "albers"
    assert plot["props"]["parallels"] == [29.5, 45.5]
    # The generated signature carries the new names.
    signature = json.loads((Path(hm.__file__).parent / "signatures.json").read_text())["Plot"]
    for name in ("equal-earth", "natural-earth", "albers", "albers-usa"):
        assert name in json.dumps(signature["projection"])
    assert "parallels" in signature
    root = Path(__file__).resolve().parents[2]
    here = os.getcwd()
    try:
        os.chdir(root)
        namespace = {}
        exec((root / "python/examples/74_map_projections.py").read_text(), namespace)
        example, _ = namespace["scene"]._snapshot()
        assert [child["props"]["projection"] for child in example["root"]["children"][0]["children"]] == [
            "equal-earth", "albers", "albers-usa"]
    finally:
        os.chdir(here)


def test_standalone_mark_display_uses_one_plot_and_local_data():
    points = hm.Points(data={"x": [1, 2], "y": [3, 4]}, x="x", y="y")
    scene = points._scene()
    assert points._scene() is scene
    scene._validate()
    root = scene._snapshot()[0]["root"]
    plot = root["children"][0]
    assert plot["kind"] == "Plot"
    assert plot["children"][0]["kind"] == "Data"
    assert plot["children"][0]["children"][0]["id"] == points.id
    assert points._export_target() == plot["id"]
    points.update(data={"x": [2, 3], "y": [4, 5]})
    assert points._scene() is scene
    assert scene._snapshot()[0]["root"]["children"][0]["id"] == plot["id"]


def test_a_standalone_mark_shows_tooltips_and_a_legend_when_it_has_one():
    # TODO 129.1: the implicit Plot hovers like a one-line chart elsewhere, and shows the
    # automatic legend when it explains something: a mark that maps nothing would leave an
    # empty strip. An explicit Plot keeps legend=False; a mark's own tooltip=False wins in the
    # browser (the Plot's tooltip applies to marks that set none).
    data = {"x": [1, 2], "y": [3, 4], "group": ["a", "b"]}

    def implicit(**props):
        mark = hm.Points(data=data, x="x", y="y", **props)
        return mark._scene()._snapshot()[0]["root"]["children"][0]["props"]

    assert implicit()["tooltip"] is True and implicit()["legend"] is False
    assert implicit(fill="red")["legend"] is False
    for props in ({"fill": "group"}, {"size": hm.col.x * 2}, {"label": "Sales"}):
        assert implicit(**props)["legend"] is True, props
    mark = hm.Points(data=data, x="x", y="y")
    scene = mark._scene()
    mark.update(fill="group")
    assert scene._snapshot()[0]["root"]["children"][0]["props"]["legend"] is True
    with hm.Plot(data=data) as plot:
        hm.Points(x="x", y="y", fill="group")
    assert "legend" not in plot.props and "tooltip" not in plot.props


def test_mark_local_data_inside_explicit_plot_and_theme_json(tmp_path):
    with hm.Plot(data={"x": [1], "y": [1]}) as plot:
        points = hm.Points(data={"x": [2], "y": [2]}, x="x", y="y")
    assert points.parent is plot
    assert plot._scene()._snapshot()[0]["root"]["children"][0]["children"][0]["kind"] == "Data"
    assert set(hm.themes.names()) == {
        "hmplot", "minimal", "ink", "paper", "presentation", "colorblind", "dark", "538",
        "finance-terminal", "pastel", "graph", "sea", "sunset", "ggplot",
        "seaborn-dark", "notebook", "graphing-calculator", "observable",
        "wes-anderson", "ghibli", "yellow-glow", "8bit",
        "vaporwave", "blueprint", "bubblegum", "spooky", "treasure-map",
        "bureau", "journal", "bauhaus", "risograph", "tufte",
    }
    path = tmp_path / "custom.json"
    path.write_text('{"name":"Custom","marks":{"Points":{"size":8}}}')
    assert hm.load_theme(path).value["marks"]["Points"]["size"] == 8
    path.write_text('{"marks":{"Points":{"madeUp":1}}}')
    with pytest.raises(ValueError, match="theme.marks.Points.madeUp"):
        hm.load_theme(path)


def test_direct_geojson_data_keeps_geometry_and_implicit_plot():
    mark = hm.GeoJSON(data={"type": "FeatureCollection", "features": []})
    scene = mark._scene()
    scene._validate()
    plot = scene._snapshot()[0]["root"]["children"][0]
    assert plot["kind"] == "Plot"
    assert plot["children"][0]["kind"] == "GeoJSON"
    assert mark._export_target() == plot["id"]


def test_visualize_tree_uses_structural_children_without_mutating_source():
    with hm.Plot(data={"x": [1, 2], "y": [3, 4]}) as original:
        points = hm.Points(x="x", y="y")
    tree = hm.visualize_tree(original)
    # Fit the actual layout and labels rather than assuming an interval layout's leaf spacing.
    assert "domain" not in tree.props.get("x", {})
    assert "domain" not in tree.props.get("y", {})
    assert tree.kind == "Plot"
    assert original.children == [points]
    state = tree._scene()._snapshot()[0]["root"]
    assert state["children"][0]["kind"] == "Data"
    assert state["children"][0]["children"][0]["kind"] == "GraphData"
    assert state["children"][0]["children"][0]["children"][0]["kind"] == "Tree"
    tree._scene()._validate()
    hm.visualize_tree(points)._scene()._validate()
    with pytest.raises(TypeError, match="HMPlot component"):
        hm.visualize_tree({})


def test_visualize_tree_colors_every_component_by_its_group():
    # R2.0b.5: a node's role is its component's group, so a new component is never unclassified.
    from hmplot import introspection
    for kind, component in hm.REGISTRY["components"].items():
        assert introspection._role(kind) == component["group"]
        assert component["group"] in introspection._GROUP_COLORS, kind
    assert introspection._role("Lollipop") == "Marks" and introspection._role("Filter") == "Transforms"


def test_visualize_tree_tooltips_describe_each_node():
    from hmplot.introspection import _node_info
    with hm.Scene() as scene:
        hm.Slider(name="grow", min=1, max=10, value=4)
        with hm.Data({"a": [1.0, 2.0], "b": [3.0, 4.0], "g": ["p", "q"]}) as data:
            with hm.Plot():
                with hm.Filter(where=hm.col.a > 1) as kept:
                    points = hm.Points(x="a", y=hm.col.b * 2, fill="g", color="red",
                                       size=hm.input.grow, shape="circle")
    info = _node_info(points)
    assert (info["kind"], info["group"]) == ("Points", "Marks")
    # The color and shape name no column, so they are literals.
    assert (info["columns"], info["inputs"]) == ("a, b, g", "grow")
    assert info["props"].startswith("x='a', y=(b * 2), fill='g', color='red', size=$grow")
    assert (info["table"], info["class"]) == (None, None)
    assert _node_info(kept)["columns"] == "a"
    assert _node_info(data)["table"] == "2 rows, 3 columns: a, b, g"
    # The drawn Points list each field some node has; their title is the group, which fill names.
    state, _ = hm.visualize_tree(scene)._scene()._snapshot()
    drawn = next(node for node in hm.core.flatten(state["root"]) if node["kind"] == "Points")
    assert [field["field"] for field in drawn["props"]["tooltip"]] == ["kind", "props", "columns", "inputs", "table"]
    assert drawn["props"]["fill"] == "group"


def test_identity_accepts_integer_and_float_keys():
    for keys, dtype in [([1, 2, 3], "int64"), (np.arange(3, dtype=np.int64), "int64"),
                        (np.array([4, 5, 6], dtype=np.int32), "int64"),  # column() widens integers
                        (np.array([0.5, 1.5, 2.5], dtype=np.float32), "float32")]:
        rows = hm.identity(keys=keys)
        assert rows.keys.dtype == dtype
        assert rows.keys.shape == (3,)
    with pytest.raises(ValueError, match="unique"):
        hm.identity(keys=[1, 1, 2])


def test_float_keys_that_collide_only_as_float32_name_the_precision_loss():
    with pytest.raises(ValueError, match=r"float32.*16777216\.0 and 16777217\.0"):
        hm.identity(keys=np.array([16777216.0, 16777217.0]))
    with pytest.raises(ValueError, match=r"^Identity keys must be unique\.$"):
        hm.identity(keys=[1.5, 1.5])
    with pytest.raises(ValueError, match=r"Table keys must be unique\..*'id'.*float32 precision"):
        hm.Table({"id": np.array([16777216.0, 16777217.0]), "x": [1.0, 2.0]}, key="id")
    with pytest.raises(ValueError, match=r"^Table keys must be unique: 1 identifies more than one row of key 'id'\."):
        hm.Table({"id": np.array([1, 1]), "x": [1.0, 2.0]}, key="id")
    assert hm.identity(keys=np.array([16777216.0, 16777218.0])).keys.dtype == "float32"


def test_a_geojson_table_cannot_be_keyed_by_its_geometry():
    features = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": [0, 0]}}]}
    with pytest.raises(ValueError, match=r"Keys must be integer, float, or categorical columns; received dtype 'geojson'"):
        hm.Table(features, key="__geojson__")


def test_table_replace_keeps_schema_outside_transaction():
    table = hm.Table({"a": ["x", "y"]})
    table.replace({"a": ["low", "high"]}, schema={"a": {"type": "ordinal", "domain": ["low", "high"]}})
    assert table.schema["a"]["type"] == "ordinal"
    assert table.columns["a"].logical_type == "ordinal"


def test_table_offsets_set_read_clear_and_travel_in_the_snapshot():
    pytest.importorskip("pandas")
    table = hm.Table({"id": ["a", "b", "c"], "x": [1.0, 2.0, 3.0], "g": ["p", "q", "p"]}, key="id")
    table.set_offsets("x", {"c": 2.5, "a": -1, "b": 0})
    frame = table.offsets
    assert frame.to_dict("records") == [{"key": "c", "column": "x", "delta": 2.5}, {"key": "a", "column": "x", "delta": -1.0}]
    with hm.Scene() as scene:
        with hm.Plot(data=table):
            hm.Points(x=hm.moved("x"), y=hm.offset("x"))
    state, _ = scene._snapshot()
    assert state["tables"][table.id]["offsets"] == {
        "version": 1, "length": 3, "columns": {"x": {"rows": [0, 2], "deltas": [-1.0, 2.5]}}}
    assert (hm.moved("x").op, hm.moved("x").args) == ("moved", ("x",))
    # One delta per row replaces the column's offsets; zeros are not kept.
    table.set_offsets("x", np.array([0.0, 4.0, 0.0]))
    assert table.offsets.to_dict("records") == [{"key": "b", "column": "x", "delta": 4.0}]
    table.clear_offsets("x")
    assert table.offsets.empty and table.offsets_version == 3
    with pytest.raises(KeyError, match="set_offsets: no row has the key 'z'"):
        table.set_offsets("x", {"z": 1})
    with pytest.raises(TypeError, match="set_offsets: 'g' is a categorical column; offsets move numeric columns"):
        table.set_offsets("g", {"a": 1})
    with pytest.raises(ValueError, match=r"set_offsets: offsets must be finite numbers; received nan for 'a'"):
        table.set_offsets("x", {"a": float("nan")})
    with pytest.raises(ValueError, match=r"set_offsets: 'x' needs one delta per row \(3\); received shape \(2,\)"):
        table.set_offsets("x", [1, 2])
    with pytest.raises(KeyError, match="clear_offsets: the table has no column 'nope'"):
        table.clear_offsets("nope")
    with pytest.raises(TypeError, match=r'offset\(\) needs the name of a table column, such as offset\("weight"\)'):
        hm.offset("@brushed")
    with pytest.raises(TypeError, match="moved"):
        hm.moved(1)


def test_table_offsets_follow_keys_and_apply_to_a_new_table():
    pytest.importorskip("pandas")
    table = hm.Table({"id": [1, 2, 3], "x": [10, 20, 30]}, key="id")
    table.set_offsets("x", {1: 1.5, 3: -2})
    table.replace({"id": [3, 4, 1], "x": [30, 40, 10]})
    assert sorted(map(tuple, table.offsets[["key", "delta"]].values.tolist())) == [(1, 1.5), (3, -2.0)]
    moved = table.apply_offsets()
    assert moved is not table and moved.key == "id" and moved.offsets.empty
    assert np.frombuffer(moved.columns["x"].payload, "<f4").tolist() == [28.0, 40.0, 11.5]
    assert np.frombuffer(table.columns["x"].payload, "<i8").tolist() == [30, 40, 10]
    unkeyed = hm.Table({"x": [1.0, 2.0]})
    unkeyed.set_offsets("x", {1: 3.0})
    unkeyed.replace({"x": [5.0, 6.0]})
    assert unkeyed.offsets.to_dict("records") == [{"key": 1, "column": "x", "delta": 3.0}]
    unkeyed.replace({"x": [5.0, 6.0, 7.0]})
    assert unkeyed.offsets.empty
    with pytest.raises(KeyError, match="set_offsets: the table has no key, so rows are indices from 0 to 2; received 3"):
        unkeyed.set_offsets("x", {3: 1.0})
    # A float key column holds float32 keys: 0.1 still names its row.
    floats = hm.Table({"k": np.array([0.1, 0.2]), "x": [1.0, 2.0]}, key="k")
    floats.set_offsets("x", {0.1: 1.0})
    assert floats.offsets["delta"].tolist() == [1.0]
    # A column that is no longer numeric drops its offsets.
    unkeyed.set_offsets("x", {0: 1.0})
    unkeyed.replace({"x": ["a", "b", "c"]})
    assert unkeyed.offsets.empty


def test_a_views_offsets_reach_the_table_and_the_other_views():
    pytest.importorskip("pandas")
    table = hm.Table({"id": ["a", "b", "c"], "x": [1.0, 2.0, 3.0], "g": ["p", "q", "p"]}, key="id")
    with hm.Scene() as scene:
        with hm.Plot(data=table):
            points = hm.Points(x=hm.moved("x"), y="x", drag=True)
    with hm.Scene() as other:
        with hm.Plot(data=table):
            hm.Points(x=hm.moved("x"), y="x")
    other._snapshot()
    scene._views["a"] = {"ready": True}
    scene._views["b"] = {"ready": True}
    other._views["c"] = {"ready": True}

    class Transport:
        def __init__(self):
            self.messages = []

        def send(self, message, buffers=None):
            self.messages.append(message)

        def publish(self, state, columns):
            pass

    scene._widget = Transport()
    other._widget = Transport()
    # The rows index the table version the view had: a republish since (another revision) does
    # not make them stale.
    points.props["size"] = 3
    scene._publish()
    base = {"type": "offsets", "scene": scene.id, "view": "a", "revision": scene.revision - 1, "table": table.id,
            "table_version": table.version}
    # Rows out of range, deltas that are not finite and non-numeric columns are left out.
    scene._receive({**base, "sequence": 2, "columns": {"x": {"rows": [2, -1, 9, 0], "deltas": [1.5, 1, 1, float("nan")]},
                                                        "g": {"rows": [0], "deltas": [1.0]}}}, [])
    scene._receive({**base, "sequence": 1, "columns": {"x": {"rows": [0], "deltas": [9.0]}}}, [])
    assert table.offsets.to_dict("records") == [{"key": "c", "column": "x", "delta": 1.5}]
    ack, broadcast = scene._widget.messages
    assert (ack["type"], ack["view"], ack["version"]) == ("offsets_ack", "a", table.offsets_version)
    assert (broadcast["type"], broadcast["view"]) == ("offsets", "b")
    assert broadcast["columns"] == {"x": {"rows": [2], "deltas": [1.5]}}
    # Another scene showing the table takes them too, so its next drag keeps this one.
    [shared] = other._widget.messages
    assert (shared["type"], shared["view"], shared["columns"]) == ("offsets", "c", {"x": {"rows": [2], "deltas": [1.5]}})
    # drag and dragend reach Python, also from before a republish, with the rows' keys (from
    # the table) and each column's change.
    seen = []
    points.on_event("drag", seen.append)
    points.on_event("dragend", seen.append)
    for event, cancelled in (("drag", None), ("dragend", False)):
        payload = {"row": 2, "rows": [2], "table": table.id, "changes": {"x": 1.5}}
        if cancelled is not None:
            payload["cancelled"] = cancelled
        scene._receive({"type": "event", "scene": scene.id, "view": "a", "revision": scene.revision - 1,
                        "target": points.id, "event": event, "payload": payload}, [])
    assert [(event.keys, event.changes) for event in seen] == [(["c"], {"x": 1.5})] * 2
    assert seen[1].cancelled is False
    with pytest.raises(ValueError, match=r"on_event: unsupported event name '\w+'; use one of click, "):
        points.on_event("dragging", seen.append)


def test_scene_close_releases_selections_and_identities():
    table = hm.Table({"x": [1.0, 2.0], "y": [3.0, 4.0]})
    rows = hm.identity(keys=["a", "b"])
    with hm.Scene() as scene:
        with hm.Data(table):
            with hm.Plot():
                hm.Points(x="x", y="y", select=table.selection)
                hm.Points(x="x", y="y", identity=rows)
    scene._snapshot()
    assert scene in table.selection._scenes and scene in rows._scenes
    scene.close()
    assert scene not in table.selection._scenes
    assert scene not in rows._scenes and scene not in rows.selection._scenes
    assert not scene._selections and not scene._identities
    with pytest.raises(RuntimeError, match="not attached to an open Scene"):
        asyncio.run(table.selection.update([0]))


def test_callback_errors_are_logged_and_kept(caplog):
    with hm.Scene() as scene:
        with hm.Plot():
            points = hm.Points(position=[[0, 0]])
    scene._views["v"] = {"ready": True}

    def broken(event):
        raise ValueError(f"boom {event.source_index}")

    points.on_click(broken)
    for index in range(12):
        scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision,
                        "target": points.id, "event": "click", "payload": {"source_index": index}}, [])
    assert scene.error == "Callback failed: boom 11"
    assert len(scene.errors) == 10 and scene.errors[0] == "Callback failed: boom 2"
    assert any("boom 11" in record.getMessage() or "boom 11" in str(record.exc_info) for record in caplog.records)


def test_async_callback_without_event_loop_is_logged_and_kept(caplog):
    with hm.Scene() as scene:
        with hm.Plot():
            points = hm.Points(position=[[0, 0]])
    scene._views["v"] = {"ready": True}

    async def handler(event):
        pass

    points.on_click(handler)
    scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision,
                    "target": points.id, "event": "click", "payload": {}}, [])
    assert scene.errors and "Async callbacks require a running notebook event loop." in scene.errors[-1]
    assert scene.error == scene.errors[-1]
    assert any("Async callbacks require" in record.getMessage() for record in caplog.records)


def test_nearby_resource_serializes_and_accepts_radius_constraints():
    table = hm.Table({"x": [1.0, 2.0], "y": [3.0, 4.0]})
    rows = hm.identity(keys=["a", "b"])
    assert isinstance(table.nearby, hm.SelectionResource) and isinstance(rows.nearby, hm.SelectionResource)
    with hm.Scene() as scene:
        with hm.Plot(data=table) as plot:
            points = hm.Points(x="x", y="y", nearby={"radius": 12, "axis": "x"}, respond="nearby")
    assert points.nearby is table.nearby
    snapshot = scene._snapshot()[0] if isinstance(scene._snapshot(), tuple) else scene._snapshot()
    assert "nearby" in next(iter(snapshot["tables"].values()))
    # Only data-unit radii can be published; pixel radii are view-local (PROTOCOL.md).
    radius = {"type": "radius", "axis": "x", "units": "data", "center": {"x": 1.5}, "radius": {"x": 0.25},
              "transform": {"x": "linear"}, "identity": "nearby:x"}
    table.nearby._receive(table.id, [0], True, [radius])
    assert table.nearby.get_constraints(data=table) == (radius,)


def test_legend_channels_and_facet_legends():
    data = {"x": [0, 1, 2], "y": [1, 2, 3], "mass": [1, 10, 100], "group": ["a", "b", "a"]}
    with hm.Scene() as scene:
        with hm.Facet(data=data, column="group", legend="cell") as facet:
            with hm.Plot():
                points = hm.Points(x="x", y="y", size="mass",
                                          size_scale=hm.continuous(domain=[1, 100], transform="log", range=[4, 20]))
                for channel in ["size", "width", "opacity", "outlineColor"]:
                    hm.Legend(target=points, channel=channel)
        hm.Legend(target=facet)
    scene._validate()
    state, _ = scene._snapshot()
    assert state["root"]["children"][0]["props"]["legend"] == "cell"
    legends = [node for node in state["root"]["children"] if node["kind"] == "Legend"]
    assert legends and legends[0]["props"]["for"] == {"$ref": facet.id}
    # A guide's target is target= only (R2.0).
    with pytest.raises(TypeError, match="unknown property 'for_'"):
        hm.Legend(for_=facet)
    scene.close()


def test_rgb_and_colormaps():
    import numpy as np
    data = {"x": [0, 1], "y": [0, 1], "r": np.array([255, 0], dtype=np.uint8),
            "g": np.array([0, 255], dtype=np.uint8), "b": np.array([0, 0], dtype=np.uint8)}
    with hm.Scene() as scene:
        with hm.Plot(data=data):
            hm.Points(x="x", y="y", fill=hm.rgb("r", "g", "b"))
            hm.Points(x="x", y="y", fill=hm.rgb(np.array([1.0, 0.0]), [0.0, 1.0], [0.0, 0.0], a=[1.0, 0.5]))
            hm.Points(x="x", y="y", fill=np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]))
    state, _ = scene._snapshot()
    marks = state["root"]["children"][0]["children"]
    assert marks[0]["props"]["fill"] == {"$rgb": {"r": "r", "g": "g", "b": "b"}}
    assert set(marks[1]["props"]["fill"]["$rgb"]) == {"r", "g", "b", "a"}
    assert all("$column" in v for v in marks[1]["props"]["fill"]["$rgb"].values())
    assert "$column" in marks[2]["props"]["fill"]
    scene.close()

    assert hm.COLORMAP_NAMES[0] == "Viridis" and "Magma" in hm.COLORMAP_NAMES
    assert hm.continuous(colormap="magma").colormap == "Magma"
    custom = hm.colormap(["#ff0000", "#0000ff"], space="hsl", positions=[0, 0.25])
    assert custom == {"colors": ["#ff0000", "#0000ff"], "space": "hsl", "positions": [0, 0.25]}
    # Evenly spaced positions are the default and normalize to None, as in JavaScript.
    assert hm.colormap(["#ff0000", "#0000ff"], positions=[0, 1])["positions"] is None
    assert hm.colormap(["red", "lime", "blue"], positions=[0, 0.5, 1])["positions"] is None
    for color, alpha in [("rgba(255, 0, 0, 0.2)", "0.2"), ("transparent", "0"), ("#ff000080", "0.502"),
                         ("rgb(255 0 0 / 50%)", "0.5"), ("#f008", "0.533")]:
        with pytest.raises(ValueError, match=re.escape(
                f'Colormap colors must be opaque: "{color}" has alpha {alpha}. Use the mark\'s opacity for translucency.')):
            hm.colormap([color, "blue"])
    assert hm.colormap(["rgba(255, 0, 0, 1)", "#0000ffff"])["colors"] == ["rgba(255, 0, 0, 1)", "#0000ffff"]
    assert hm.continuous(colormap=["red", "blue"]).colormap == {"colors": ["red", "blue"], "space": "lab", "positions": None}
    assert hm.continuous(colormap=custom).snapshot()["colormap"] == custom
    with pytest.raises(ValueError, match="Unknown colormap: Nope. Valid names: Viridis"):
        hm.continuous(colormap="Nope")
    with pytest.raises(ValueError, match="at least two"):
        hm.colormap(["red"])
    with pytest.raises(ValueError, match="ascending"):
        hm.colormap(["red", "blue"], positions=[1, 0])
    with pytest.raises(ValueError, match='space must be "lab"'):
        hm.colormap(["red", "blue"], space="cmyk")
    with pytest.raises(ValueError, match="Unknown colormap property: stops"):
        hm.continuous(colormap={"colors": ["red", "blue"], "stops": [0, 1]})
    assert hm.load_theme  # themes validate colormap too
    from hmplot.data import _validate_theme_definition
    _validate_theme_definition({"colormap": ["#000", "#fff"]})
    with pytest.raises(ValueError, match="theme.colormap: Unknown colormap"):
        _validate_theme_definition({"colormap": "Nope"})



def test_continuous_scale_without_colormap_inherits_the_theme_default():
    scale = hm.continuous(domain=[0, 1])
    assert scale.colormap is None and scale.snapshot()["colormap"] is None
    with hm.Scene() as scene:
        with hm.Theme(value=hm.create_theme(colormap="Magma")):
            with hm.Plot(data={"x": [0.0, 1.0], "value": [0.0, 1.0]}):
                hm.Points(x="x", y="x", fill="value", fill_scale=scale)
    state, _ = scene._snapshot()
    assert state["scales"][scale.id]["colormap"] is None  # the browser resolves the theme's
    scale.update(colormap="magma")
    assert scale.colormap == "Magma"
    scale.update(colormap=None)  # back to the inherited default, like JS update({colormap: null})
    assert scale.colormap is None and scale.range is None
    state, _ = scene._snapshot()
    assert state["scales"][scale.id]["colormap"] is None
    scene.close()
    sized = hm.continuous(domain=[0, 1], range=[4, 20])
    assert sized.colormap is None and sized.range == [4.0, 20.0]
    sized.update(colormap="Viridis")
    assert sized.colormap == "Viridis" and sized.range is None


def test_continuous_scale_missing_color_and_the_theme_token():
    # TODO 73.3: the color a missing value of a colormapped channel draws in, as JS's continuous({missing}).
    scale = hm.continuous(domain=[0, 1], missing="#ff00ff")
    assert scale.missing == "#ff00ff" and scale.snapshot()["missing"] == "#ff00ff"
    scale.update(missing=None)  # back to the theme's, like JS update({missing: null})
    assert scale.missing is None and "missing" not in scale.snapshot()
    with pytest.raises(ValueError, match="missing must be a CSS color"):
        hm.continuous(missing=3)
    with pytest.raises(ValueError, match="a scale with a numeric range \\(sizes, widths\\) has none"):
        hm.continuous(range=[2, 8], missing="red")
    assert hm.continuous(missing="red").update(range=[1, 2]).missing is None
    from hmplot.data import _validate_theme_definition
    _validate_theme_definition({"missing": "#cccccc"})
    with pytest.raises(ValueError, match="theme.missing must be a CSS color"):
        _validate_theme_definition({"missing": 7})

def test_shape_channel_and_custom_shapes():
    pentagon = [[0, 1], [0.95, 0.31], [0.59, -0.81], [-0.59, -0.81], [-0.95, 0.31]]
    assert hm.register_shape("py-pentagon", pentagon) == "py-pentagon"
    assert hm.register_shape("py-pentagon", pentagon) == "py-pentagon"  # idempotent
    assert hm.register_shape("py-wedge", "M0 1 L1 -1 L-1 -1 Z") == "py-wedge"
    data = {"x": [0, 1], "y": [0, 1], "island": ["Biscoe", "Dream"]}
    with hm.Scene() as scene:
        with hm.Plot(data=data):
            hm.Points(x="x", y="y", shape="island")
            hm.Points(x="x", y="y", shape="circle")
            hm.Points(x="x", y="y", shape=["py-pentagon", "star"])
            with pytest.raises(TypeError, match="unknown property 'shape_field'"):
                hm.Points(x="x", y="y", shape_field="island")
    state, _ = scene._snapshot()
    marks = state["root"]["children"][0]["children"]
    assert marks[0]["props"]["shape"] == "island"      # a column name resolves in the browser
    assert marks[1]["props"]["shape"] == "circle"      # a shape name stays literal
    assert "$column" in marks[2]["props"]["shape"]     # per-row names become a column
    assert state["shapes"]["py-pentagon"] == [[float(x), float(y)] for x, y in pentagon]
    assert state["shapes"]["py-wedge"] == "M0 1 L1 -1 L-1 -1 Z"      # a path is sent as it was given
    scene.close()
    assert hm.BUILTIN_SHAPES == tuple(hm.core.REGISTRY["shapes"]["builtin"])
    with pytest.raises(ValueError, match="py-pentagon is already registered with a different outline"):
        hm.register_shape("py-pentagon", [[0, 1], [1, -1], [-1, -1]])
    with pytest.raises(ValueError, match="built-in shape"):
        hm.register_shape("star", pentagon)
    with pytest.raises(ValueError, match="unit square"):
        hm.register_shape("py-big", [[0, 2], [1, -1], [-1, -1]])
    # TODO 55: crossing polygons, curves, and icon paths with a viewBox and a fill rule.
    assert hm.register_shape("py-bowtie", [[-1, -1], [1, 1], [1, -1], [-1, 1]]) == "py-bowtie"
    assert hm.register_shape("py-curve", "M0 0 C1 1 1 1 0 1 Z") == "py-curve"
    ring = "M0 0 L24 0 L24 24 L0 24 Z M6 6 L18 6 L18 18 L6 18 Z"
    assert hm.register_shape("py-ring", ring, fill_rule="evenodd", view_box=[0, 0, 24, 24]) == "py-ring"
    assert hm.data.registered_shapes()["py-ring"] == {"path": ring, "fillRule": "evenodd", "viewBox": [0.0, 0.0, 24.0, 24.0]}
    from hmplot.data import _validate_theme_definition
    _validate_theme_definition({"shapes": {"py-kite": [[0, 1], [0.5, 0], [0, -1], [-0.5, 0]]}})
    with pytest.raises(ValueError, match="theme.shapes.py-bad: Shape py-bad needs at least 3 vertices"):
        _validate_theme_definition({"shapes": {"py-bad": [[0, 0]]}})


SHAPE_NAME_RULE = "Shape names must start with a letter and contain letters, digits, _ or -."


@pytest.mark.parametrize("name, vertices, message", [
    ("pentágono", [[0, 1], [1, -1], [-1, -1]], SHAPE_NAME_RULE),
    ("bad name", [[0, 1], [1, -1], [-1, -1]], SHAPE_NAME_RULE),
    ("9lives", [[0, 1], [1, -1], [-1, -1]], SHAPE_NAME_RULE),
    ("sphere", [[0, 1], [1, -1], [-1, -1]], "sphere is a 3D shape name and cannot be registered."),
    ("hexagon", [[0, 1], [1, -1], [-1, -1]], "hexagon is a built-in shape and cannot be redefined."),
    ("py-two", [[0, 0], [1, 1]], "Shape py-two needs at least 3 vertices."),
    ("py-scalar", 5, "Shape py-scalar must be a list of [x, y] vertices or SVG path data."),
    ("py-flat-array", np.array([0, 1, 1, -1, -1, -1]), "Shape py-flat-array vertices must be [x, y] pairs of finite numbers."),
    ("py-bool", [[True, 1], [1, -1], [-1, -1]], "Shape py-bool vertices must be [x, y] pairs of finite numbers."),
    ("py-nan", [[0, np.nan], [1, -1], [-1, -1]], "Shape py-nan vertices must be [x, y] pairs of finite numbers."),
    ("py-out", [[0, 2], [1, -1], [-1, -1]], "Shape py-out vertices must lie in the unit square [-1, 1]."),
    ("py-dup", [[0, 1], [0, 1], [1, -1], [0, 1]], "Shape py-dup needs at least 3 distinct vertices."),
    ("py-many", [[np.cos(i), np.sin(i)] for i in range(4097)], "Points: shape py-many's outline needs 4,097 segments; the limit is 4,096 segments. Use fewer vertices."),
    ("py-line", [[0, 0], [0.5, 0.5], [1, 1]], "Shape py-line has zero area; its vertices are collinear."),
    ("py-short-curve", "M0 0 C1 1 1 1", "Shape path command C needs 6 numbers per segment."),
    ("py-stray", "M0 1 L1 -1 X-1 -1 Z", 'Shape paths use SVG path commands (M, L, H, V, C, S, Q, T, A, Z); found "X".'),
    ("py-after", "M0 1 L1 -1 L-1 -1 Z 0 0", "Shape path numbers after Z need a command."),
    ("py-odd", "M0 1 L1 -1 L-1", "Shape path command L needs 2 numbers per segment."),
    ("py-flag", "M0 0 A1 1 0 2 1 1 1", "Shape path arc flags must be 0 or 1."),
    ("py-outside", "M0 0 L3 0 L0 3 Z", "Shape py-outside must lie in the unit square [-1, 1]; give a viewBox to fit a path drawn in other coordinates."),
    ("py-flat-path", "M0 0 L1 0 L0.5 0 Z", "Shape py-flat-path has zero area."),
    ("py-rule", {"path": "M0 0 L1 0 L0 1 Z", "fillRule": "odd"}, 'Shape py-rule fillRule must be "nonzero" or "evenodd".'),
    ("py-box", {"path": "M0 0 L1 0 L0 1 Z", "viewBox": [0, 0, 0, 1]}, "Shape py-box viewBox must be [minX, minY, width, height] with a positive width and height."),
    ("py-start", "0 1 L1 -1 L-1 -1", "A shape path must start with M."),
])
def test_shape_validation_matches_the_renderer(name, vertices, message):
    import re
    with pytest.raises(ValueError, match="^" + re.escape(message) + "$"):
        hm.register_shape(name, vertices)
    assert name not in hm.data.registered_shapes()


def test_shape_accepts_numpy_paths_with_exponents_and_either_winding():
    triangle = [[0.0, 1.0], [1.0, -1.0], [-1.0, -1.0]]
    assert hm.register_shape("py-np", np.array(triangle, dtype=np.float32)) == "py-np"
    assert hm.register_shape("py-np-int", np.array([[0, 1], [1, -1], [-1, -1]], dtype=np.int64)) == "py-np-int"
    assert hm.register_shape("py-np-scalars", [[np.float32(0), np.int64(1)], (np.float64(1), -1), np.array([-1, -1])]) == "py-np-scalars"
    assert hm.register_shape("py-exp", "M0 1e0 L1E+0 -1 L-1 -1e-0 Z") == "py-exp"
    assert hm.register_shape("py-closing", "M0 1 L1 -1 L-1 -1 L0 1 Z") == "py-closing"
    clockwise = [[-1, -1], [-1, 1], [1, 1], [1, -1]]
    assert hm.register_shape("py-clockwise", clockwise) == "py-clockwise"
    shapes = hm.data.registered_shapes()
    for name in ("py-np", "py-np-int", "py-np-scalars"):
        assert shapes[name] == triangle, name
    # Paths are kept as given; the browser parses them the same way.
    assert shapes["py-exp"] == "M0 1e0 L1E+0 -1 L-1 -1e-0 Z" and shapes["py-closing"] == "M0 1 L1 -1 L-1 -1 L0 1 Z"
    assert all(type(v) is float for point in shapes["py-np"] for v in point)
    with pytest.raises(ValueError, match="^Shape py-np is already registered with a different outline.$"):
        hm.register_shape("py-np", clockwise)


def test_shape_vocabulary_is_capped_like_the_renderer(monkeypatch):
    limit = hm.core.REGISTRY["shapes"]["maxShapes"] - len(hm.BUILTIN_SHAPES)
    monkeypatch.setattr(hm.data, "_SHAPES", {})
    for i in range(limit):
        hm.register_shape(f"py-cap{i}", [[0, 1], [1, -1 + i / 1000], [-1, -1]])
    message = (f"Points: custom shapes on one page needs {limit + 1:,} shapes; the limit is {limit:,} shapes. "
               "Reuse shapes, or draw some marks as Polygons.")
    with pytest.raises(ValueError, match="^" + re.escape(message) + "$"):
        hm.register_shape("py-one-more", [[0, 1], [1, -1], [-1, -1]])
    assert hm.register_shape("py-cap0", [[0, 1], [1, -1], [-1, -1]]) == "py-cap0"  # re-registration is fine


def test_builtin_shapes_come_from_the_renderer():
    from pathlib import Path
    import re
    shapes = hm.core.REGISTRY["shapes"]
    assert hm.BUILTIN_SHAPES == tuple(shapes["builtin"])
    assert hm.data.MAX_SHAPE_SEGMENTS == shapes["maxSegments"]
    source = Path(__file__).resolve().parents[2] / "src/lib/plot/utils/shapes.js"
    if not source.exists():
        pytest.skip("renderer source not available")
    text = source.read_text()
    js = re.findall(r'"([\w-]+)"', re.search(r"BUILTIN_SHAPES = Object\.freeze\(\[(.*?)\]\)", text, re.S).group(1))
    assert list(hm.BUILTIN_SHAPES) == js, "run python3 scripts/generate-python-api.py"
    paths = (source.parent / "shapePaths.js").read_text()
    assert shapes["maxSegments"] == int(re.search(r"MAX_SHAPE_SEGMENTS = (\d+);", paths).group(1))
    assert shapes["maxShapes"] == int(re.search(r"MAX_SHAPES = (\d+);", text).group(1))


def test_theme_shapes_validate_without_registering_and_round_trip():
    from hmplot.data import _validate_theme_definition
    kite = [[0.0, 1.0], [0.5, 0.0], [0.0, -1.0], [-0.5, 0.0]]
    with pytest.raises(ValueError, match="^theme.shapes.star: star is a built-in shape and cannot be redefined.$"):
        _validate_theme_definition({"shapes": {"py_theme_first": kite, "star": kite}})
    assert "py_theme_first" not in hm.data.registered_shapes(), "validation has no side effects"
    _validate_theme_definition({"shapes": {"py_theme_kite": kite}})
    assert "py_theme_kite" not in hm.data.registered_shapes()
    with pytest.raises(ValueError, match="^theme.shapes.bad name: " + SHAPE_NAME_RULE.replace(".", r"\.") + "$"):
        hm.create_theme(shapes={"bad name": kite})
    # Snake-case shape names stay verbatim (other theme keys become camelCase), and numpy
    # vertices become JSON lists; the snapshot validates again as a theme definition.
    paper = hm.create_theme(shapes={"py_theme_kite": np.array(kite), "arrow-head": "M0 1 L1 -1 L0 -0.4 L-1 -1 Z"},
                     typography={"font_size": 11})
    with hm.Scene(theme=paper) as scene:
        with hm.Plot(data={"x": [0, 1], "y": [0, 1]}):
            hm.Points(x="x", y="y", shape="py_theme_kite")
    state, _ = scene._snapshot()
    value = json.loads(json.dumps(state["themes"][paper.id]["value"], allow_nan=False))
    assert value["shapes"] == {"py_theme_kite": kite, "arrow-head": "M0 1 L1 -1 L0 -0.4 L-1 -1 Z"}
    assert value["typography"] == {"fontSize": 11}
    _validate_theme_definition(value)
    paper.update(shapes={"py_theme_dart": [[0, 1], [0.4, -1], [0, -0.5], [-0.4, -1]]})
    assert set(scene._snapshot()[0]["themes"][paper.id]["value"]["shapes"]) == {"py_theme_kite", "arrow-head", "py_theme_dart"}
    scene.close()


@pytest.mark.asyncio
async def test_camera_commands_and_kwargs():
    with hm.Scene() as scene:
        plot = hm.Plot(type="3d", camera_mode="flyover", fly_speed=2, camera_position=[1, 2, 3],
                       camera_target=[0, 0, 0], camera_fov=40)
    state, _ = scene._snapshot()
    props = state["root"]["children"][0]["props"]
    assert props["flySpeed"] == 2 and props["cameraPosition"] == [1, 2, 3] and props["cameraFov"] == 40
    scene._views["test"] = {"ready": True, "revision": scene.revision}
    camera = {"position": [1, 2, 3], "target": [0, 0, 0], "up": [0, 1, 0], "fov": 40, "near": 0.1, "far": 2000, "zoom": 1, "mode": "flyover"}

    class Transport:
        def __init__(self):
            self.messages = []

        def send(self, message):
            self.messages.append(message)
            if message.get("type") == "command" and message.get("command") == "camera":
                if message["args"].get("state"):
                    camera.update(message["args"]["state"])
                scene._receive({"type": "result", "scene": scene.id, "request": message["request"], "value": dict(camera)}, [])

    scene._widget = Transport()
    assert (await plot.get_camera(timeout=1))["position"] == [1, 2, 3]
    moved = await plot.set_camera({"position": (5, 6, 7)}, fov=30, animate=True, timeout=1)
    assert moved["position"] == [5, 6, 7] and moved["fov"] == 30.0
    sent = [m for m in scene._widget.messages if m.get("command") == "camera"][-1]
    assert sent["args"]["animate"] is True and sent["args"]["state"] == {"position": [5, 6, 7], "fov": 30.0}
    with pytest.raises(TypeError, match="set_camera does not accept mode"):
        await plot.set_camera(mode="orbit")


@pytest.mark.asyncio
async def test_viewport_commands_and_change_event():
    with hm.Scene() as scene:
        plot = hm.Plot(coordinates="spherical", projection="orthographic")
    scene._views["test"] = {"ready": True, "revision": scene.revision}
    viewport = {"x": 0.5, "y": 0.5, "zoom": 1, "zoomX": 1, "zoomY": 1,
                "center": [0, 0]}

    class Transport:
        def __init__(self):
            self.messages = []

        def publish(self, state, columns):
            pass

        def send(self, message):
            self.messages.append(message)
            if message.get("type") == "command" and message.get("command") == "viewport":
                viewport.update(message["args"].get("state") or {})
                scene._receive({"type": "result", "scene": scene.id,
                                "request": message["request"], "value": dict(viewport)}, [])

    scene._widget = Transport()
    assert (await plot.get_viewport(timeout=1))["center"] == [0, 0]
    moved = await plot.set_viewport(center=(30, 10), zoom_x=2, zoom_y=2, timeout=1)
    assert moved["center"] == [30.0, 10.0]
    assert moved["zoomX"] == moved["zoomY"] == 2.0
    sent = [message for message in scene._widget.messages
            if message.get("command") == "viewport"][-1]
    assert sent["args"]["state"] == {"center": [30.0, 10.0], "zoomX": 2.0, "zoomY": 2.0}
    with pytest.raises(TypeError, match="set_viewport does not accept camera"):
        await plot.set_viewport(camera={})
    with pytest.raises(TypeError, match="center needs two finite"):
        await plot.set_viewport(center=[0, float("nan")])
    with pytest.raises(ValueError, match="zoom must be positive"):
        await plot.set_viewport(zoom=0)

    seen = []
    plot.on_event("viewportchange", seen.append)
    scene._receive({"type": "event", "scene": scene.id, "view": "test",
                    "revision": scene.revision, "target": plot.id,
                    "event": "viewportchange", "payload": {"viewport": dict(viewport)}}, [])
    assert len(seen) == 1 and seen[0].target is plot
    assert seen[0].viewport["center"] == [30.0, 10.0]


def test_headless_export_session_viewport_commands(monkeypatch):
    with hm.Scene():
        plot = hm.Plot(coordinates="spherical", projection="orthographic")
    calls = []
    with hm.ExportSession() as session:
        monkeypatch.setattr(session, "_ensure_browser", lambda: None)
        monkeypatch.setattr(session, "_mount", lambda target: None)

        def command(name, target, args):
            calls.append((name, target, args))
            return {"value": {"center": args.get("state", {}).get("center", [0, 0])}}

        monkeypatch.setattr(session, "_command", command)
        assert session.get_viewport(plot)["center"] == [0, 0]
        assert session.set_viewport(plot, center=np.array([45, 10]), zoom_x=2)["center"] == [45.0, 10.0]
        assert calls[-1] == ("viewport", plot.id,
                             {"state": {"center": [45.0, 10.0], "zoomX": 2.0}})
        with pytest.raises(TypeError, match="center needs two finite"):
            session.set_viewport(plot, center=[0, float("inf")])


def test_camera_vectors_normalize_and_camerachange_decodes():
    import numpy as np
    with hm.Scene() as scene:
        plot = hm.Plot(type="3d", camera_position=np.array([1.0, 2.0, 3.0]), camera_target=(0, 0, 1), camera_up=[0, 0, 1])
    state, _ = scene._snapshot()
    props = state["root"]["children"][0]["props"]
    assert props["cameraPosition"] == [1.0, 2.0, 3.0] and props["cameraTarget"] == [0.0, 0.0, 1.0]
    assert props["cameraUp"] == [0.0, 0.0, 1.0]
    plot.update(camera_position=np.array([4, 5, 6]))
    assert plot.props["cameraPosition"] == [4.0, 5.0, 6.0]
    with pytest.raises(ValueError, match=r"camera_position must be three finite numbers \[x, y, z\], not 2 values"):
        hm.Plot(type="3d", camera_position=[1, 2])
    with pytest.raises(TypeError, match="camera_up must be three numbers"):
        hm.Plot(type="3d", camera_up="up")
    with pytest.raises(ValueError, match="camera_target must be three finite numbers"):
        hm.Plot(type="3d", camera_target=[1, float("nan"), 3])
    # camerachange is a registrable event, decoded with the camera fields.
    seen = []
    with hm.Scene() as scene:
        plot = hm.Plot(type="3d", camera_mode="flyover")
        plot.on_event("camerachange", seen.append)
    with pytest.raises(ValueError, match=r"on_event: unsupported event name '\w+'; use one of click, "):
        plot.on_event("cameramove", seen.append)
    scene._views["v"] = {"ready": True, "revision": scene.revision}
    scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision,
                    "target": plot.id, "event": "camerachange",
                    "payload": {"position": [1, 2, 3], "target": [0, 0, 0], "up": [0, 1, 0], "fov": 50,
                                "near": 0.1, "far": 2000, "zoom": 1, "mode": "flyover"}}, [])
    assert len(seen) == 1
    assert seen[0].position == [1, 2, 3] and seen[0].mode == "flyover" and seen[0].fov == 50
    assert seen[0].target is plot and seen[0].view == "v"
    assert seen[0].camera == {"position": [1, 2, 3], "target": [0, 0, 0], "up": [0, 1, 0], "fov": 50,
                              "near": 0.1, "far": 2000, "zoom": 1, "mode": "flyover"}


def test_compound_marks_move_is_invisible_to_python():
    # Compound marks moved to src/lib/compound; only registry module paths changed.
    for name in ("Histogram", "Violin", "BoxPlot", "Swarm", "Bar", "Lollipop", "Pie"):
        module = hm.REGISTRY["components"][name]["module"]
        assert module.startswith("./compound/"), (name, module)
    with hm.Scene() as scene:
        with hm.Plot(data={"category": ["a", "b"], "value": [1, 2]}):
            hm.charts.Histogram(x="value", bins=3, normalization="proportion")
            pops = hm.charts.Lollipop(x="category", y="value", size=12, baseline=0, stem={"color": "gray", "width": 3})
    state, _ = scene._snapshot()
    histogram, lollipop = state["root"]["children"][0]["children"]
    assert histogram["kind"] == "Histogram"
    assert histogram["props"] == {"x": "value", "bins": 3, "normalization": "proportion"}
    assert lollipop["kind"] == "Lollipop"
    # Its named part takes the stems' props as one dict, sent as given (TODO 130.3).
    assert lollipop["props"] == {"x": "category", "y": "value", "size": 12, "baseline": 0, "stem": {"color": "gray", "width": 3}}
    pops.update(stem={"width": 4})
    assert pops.props["stem"] == {"width": 4}
    for key, field in (("stem_color", "color"), ("stemColor", "color"), ("stem_width", "width"), ("stemWidth", "width")):
        with pytest.raises(TypeError, match=re.escape(f'Pass stem={{"{field}": ...}}')):
            hm.charts.Lollipop(x="category", y="value", **{key: 2})
        with pytest.raises(TypeError, match=re.escape(f'Pass stem={{"{field}": ...}}')):
            pops.update(**{key: 2})


def test_tooltip_settings():
    pytest.importorskip("pandas")
    # TODO 44: tooltip= on every mark and on Plot, checked as the browser checks it.
    import runpy
    from pathlib import Path
    with hm.Scene() as scene:
        with hm.Plot(data={"bill": [1.0, 2.0], "species": ["a", "b"]}, tooltip={"mode": "x"}):
            hm.Points(x="bill", y="bill", tooltip=["species", {"field": "bill", "label": "Bill", "format": ".1f"}])
            hm.Line(x="bill", y="bill", tooltip={"radius": 24})
    state, _ = scene._snapshot()
    plot = state["root"]["children"][0]
    assert plot["props"]["tooltip"] == {"mode": "x"}
    points, line = plot["children"]
    assert points["props"]["tooltip"] == ["species", {"field": "bill", "label": "Bill", "format": ".1f"}]
    assert line["props"]["tooltip"] == {"radius": 24}
    for bad, message in [
        ({"content": "x"}, "content is a Svelte snippet"),
        ({"mode": "x"}, "takes fields, radius, not mode"),
        ({"radius": -1}, "radius must be a number"),
        ([{"name": "x"}], "fields are column names"),
        ("species", "must be True, a list of fields"),
    ]:
        with pytest.raises(ValueError, match=message):
            hm.Points(x="bill", y="bill", tooltip=bad)
    with pytest.raises(ValueError, match='mode must be "row"'):
        hm.Plot(tooltip={"mode": "y"})
    example = runpy.run_path(str(Path(__file__).resolve().parents[1] / "examples" / "78_tooltips.py"))
    assert [plot.props.get("tooltip") for plot in example["scene"].children[0].children] == [None, {"mode": "x"}]


def test_nearest_settings_and_resource():
    # TODO 72: nearest= on marks and Plot, the table's nearest resource and @nearest.
    table = hm.Table({"x": [1.0, 2.0], "y": [3.0, 4.0]})
    focus = hm.selection()
    assert isinstance(table.nearest, hm.SelectionResource) and isinstance(hm.identity(keys=["a"]).nearest, hm.SelectionResource)
    with hm.Scene() as scene:
        with hm.Plot(data=table, nearest={"radius": 12}):
            points = hm.Points(x="x", y="y", nearest=True, respond="nearest", size=hm.where(hm.view.nearest, 10, 5))
            hm.Line(x="x", y="y", nearest={"selection": focus, "radius": 8})
    assert points.nearest is table.nearest
    state, _ = scene._snapshot()
    plot = state["root"]["children"][0]
    assert plot["props"]["nearest"] == {"radius": 12}
    drawn, line = plot["children"]
    assert drawn["props"]["nearest"] is True and drawn["props"]["respond"] == "nearest"
    assert line["props"]["nearest"]["radius"] == 8 and "$selection" in line["props"]["nearest"]["selection"]
    assert "nearest" in next(iter(state["tables"].values()))
    assert "nearest" in hm.STATE_NAMES and "any_nearest" in hm.STATE_NAMES
    with pytest.raises(ValueError, match="unknown key 'units'"):
        hm.Points(x="x", y="y", nearest={"radius": 4, "units": "data"})
    with pytest.raises(Exception, match="nearest"):
        hm.Heatmap(fill=[[1.0, 2.0]], nearest=True)


def test_rules_and_crosshair():
    pytest.importorskip("pandas")
    # TODO 45: RuleX, RuleY and Crosshair are generated compound marks; a rule per row of a table
    # is wrapped in a Data scope like any mark, and the pointer is a string channel.
    import runpy
    from pathlib import Path
    for name in ("RuleX", "RuleY", "Crosshair"):
        assert hm.REGISTRY["components"][name]["module"] == f"./compound/{name[0].lower()}{name[1:]}.svelte"
        assert name in hm.REGISTRY["marks"]
    with hm.Scene() as scene:
        with hm.Plot(data={"t": [1.0, 2.0], "v": [3.0, 4.0]}):
            hm.charts.RuleY(y=2.5, dash=[4, 2], color="#cf8955")
            hm.charts.RuleX(data={"t": [1.5]}, x="t", y0=0, y1="@pointer_y")
            hm.charts.Crosshair(axes="x", text_color="#222222")
    state, _ = scene._snapshot()
    rule_y, events, crosshair = state["root"]["children"][0]["children"]
    assert rule_y["props"] == {"y": 2.5, "dash": [4, 2], "color": "#cf8955"}
    assert events["kind"] == "Data" and events["children"][0]["props"] == {"x": "t", "y0": 0, "y1": "@pointer_y"}
    assert crosshair["props"] == {"axes": "x", "textColor": "#222222"}
    # A Crosshair styles its own parts: no table and no mark appearance keywords.
    for keyword in ("data", "opacity", "fill"):
        with pytest.raises(TypeError):
            hm.charts.Crosshair(**{keyword: 1})
    assert hm.create_theme(marks={"Crosshair": {"color": "#000000"}, "RuleX": {"width": 2}}).value["marks"]["RuleX"]["width"] == 2
    example = runpy.run_path(str(Path(__file__).resolve().parents[1] / "examples" / "77_crosshair.py"))
    kinds = [child.kind for child in example["plot"].children]
    assert kinds == ["Line", "RuleY", "Data", "Crosshair"]


def test_pixel_offsets_use_dx_dy_and_explain_old_spellings():
    for component in (hm.Points, hm.Text, hm.charts.Callout):
        mark = component(dx=8, dy=-12)
        assert mark.props["dx"] == 8 and mark.props["dy"] == -12
        for old, new in (("offset_x", "dx"), ("offsetX", "dx"), ("offset_y", "dy"), ("offsetY", "dy")):
            with pytest.raises(TypeError, match=f"Pass {new} for a pixel offset"):
                component(**{old: 2})


def test_titles_markdown_callouts_and_bands():
    # TODO 46: a Plot's title, subtitle and caption and its bands; Title and Markdown are layout
    # text (positional text, refused inside a Plot); Callout is a compound mark.
    import runpy
    from pathlib import Path
    with hm.Scene() as scene:
        with hm.Column():
            hm.Title("Anomaly, {$year}", size="subtitle")
            hm.Markdown("**Note** $x^2$", width=300)
            with hm.Plot(data={"t": [1.0, 2.0], "v": [3.0, 4.0]}, title="T", subtitle="S", caption="C",
                         bands=[{"axis": "x", "from": 1.2, "to": 1.6, "label": "b", "opacity": 0.2}]):
                hm.charts.Callout(x=1.5, y=3.5, text="peak", dx=-20, dy=30, box={"fill": "#ffffff", "padding": 6}, leader=False)
                with hm.Frame(bands=[{"axis": "y", "from": 3, "to": 4}], rules=[{"axis": "y", "value": 3.5}]):
                    hm.Line(x="t", y="v")
        hm.Slider(name="year", min=1990, max=2020, step=1)
    state, _ = scene._snapshot()
    title, markdown, plot = state["root"]["children"][0]["children"]
    assert (title["kind"], title["props"]) == ("Title", {"text": "Anomaly, {$year}", "size": "subtitle"})
    assert (markdown["kind"], markdown["props"]) == ("Markdown", {"text": "**Note** $x^2$", "width": 300})
    assert {key: plot["props"][key] for key in ("title", "subtitle", "caption", "bands")} == {
        "title": "T", "subtitle": "S", "caption": "C", "bands": [{"axis": "x", "from": 1.2, "to": 1.6, "label": "b", "opacity": 0.2}]}
    callout, frame = plot["children"]
    assert callout["props"] == {"x": 1.5, "y": 3.5, "text": "peak", "dx": -20, "dy": 30, "box": {"fill": "#ffffff", "padding": 6}, "leader": False}
    assert frame["props"] == {"bands": [{"axis": "y", "from": 3, "to": 4}], "rules": [{"axis": "y", "value": 3.5}]}
    assert hm.REGISTRY["components"]["Markdown"]["module"] == "./scene/markdown.svelte"
    assert "Callout" in hm.REGISTRY["marks"]
    with pytest.raises(TypeError, match='Title takes its text as one string: hm.Title\\("..."\\) or text="..."'):
        hm.Title("a", "b")
    with pytest.raises(TypeError, match="Markdown: unknown property 'size'"):
        hm.Markdown("a", size=3)
    for kind in ("Title", "Markdown"):
        with pytest.raises(ValueError, match=f"{kind} is text for layouts: put it in a Scene, Row, Column or Grid"):
            with hm.Scene():
                with hm.Plot():
                    getattr(hm, kind)("inside")
    for bands, message in [({}, "Bands must be a list."), ([{"axis": "z", "from": 0, "to": 1}], 'A band\'s axis is "x" or "y"; received "z".'),
                           ([{"axis": "x", "from": True, "to": 1}], "A band's from and to are each a number, a date, or an ISO date"),
                           ([{"axis": "x", "from": 0, "to": 1, "opacity": 2}], "A band's opacity must be between 0 and 1.")]:
        with pytest.raises(ValueError, match=re.escape(message)):
            with hm.Scene():
                hm.Plot(bands=bands)
    assert hm.create_theme(marks={"Callout": {"color": "#111111"}}).value["marks"]["Callout"] == {"color": "#111111"}
    example = runpy.run_path(str(Path(__file__).resolve().parents[1] / "examples" / "79_titles_and_markdown.py"))
    kinds = [child.kind for child in example["scene"].children[0].children]
    assert kinds == ["Title", "Title", "Row", "Slider"]


def test_plot_description_props_and_sync():
    # TODO 49: description= and describe= pass through; plot.description follows the browser.
    with hm.Scene() as scene:
        plot = hm.Plot(data={"x": [1.0, 2.0]}, description="Rises.", describe=False)
    state, _ = scene._snapshot()
    assert {key: state["root"]["children"][0]["props"][key] for key in ("description", "describe")} == {"description": "Rises.", "describe": False}
    assert plot.description is None
    scene._receive({"type": "description", "scene": scene.id, "target": plot.id, "text": "Rises.", "revision": scene.revision}, [])
    assert plot.description == "Rises."
    # A description from before the last change is dropped.
    scene._receive({"type": "description", "scene": scene.id, "target": plot.id, "text": "Old.", "revision": scene.revision - 1}, [])
    assert plot.description == "Rises."
    for props, message in [({"describe": "yes"}, "Plot describe must be True or False."), ({"description": 3}, "Plot description must be a string.")]:
        with pytest.raises(TypeError, match=message):
            with hm.Scene():
                hm.Plot(**props)


def test_pie_snapshot_example_and_validation():
    # TODO 39.4: hm.charts.Pie is a generated compound mark, as JavaScript's Pie.
    import runpy
    from pathlib import Path
    assert hm.REGISTRY["components"]["Pie"]["module"] == "./compound/pie.svelte"
    assert "Pie" in hm.REGISTRY["marks"]
    assert "Pie" in hm.REGISTRY["connections"]["compoundEndpointKinds"]
    assert hm.REGISTRY["connections"]["attachments"]["Pie"] == {"default": "center", "names": ["center", "left", "right", "bottom", "top", "outer", "inner"]}
    with hm.Scene() as scene:
        with hm.Plot(data={"region": ["a", "b"], "sales": [1.0, 2.0]}):
            hm.charts.Pie(value="sales", category="region", sort=["b", "a"], start_angle=-90, end_angle=90,
                   pad_angle=1, inner_radius=0.5, sector_label=hm.col("sales") * 10, sector_label_format=".1f",
                   placement={"anchor": [0.5, 0.5], "size": [120, 120]})
    state, _ = scene._snapshot()
    assert state["root"]["children"][0]["children"][0]["props"] == {
        "value": "sales", "category": "region", "sort": ["b", "a"], "startAngle": -90, "endAngle": 90,
        "padAngle": 1, "innerRadius": 0.5, "sectorLabelFormat": ".1f",
        "sectorLabel": {"$expression": {"op": "multiply", "args": [{"$expression": {"op": "column", "args": ["sales"]}}, 10]}},
        "placement": {"anchor": [0.5, 0.5], "size": [120, 120], "version": 1},
    }
    with pytest.raises(TypeError, match="Pie: unknown property 'inner_radus'. Did you mean 'inner_radius'"):
        hm.charts.Pie(value="sales", inner_radus=0.5)
    # A compound mark takes the keywords of the building blocks it uses, not of every block.
    with pytest.raises(TypeError, match="Bar: unknown property 'cap_size'"):
        hm.charts.Bar(x="a", y="b", cap_size=3)
    assert hm.create_theme(marks={"Pie": {"fill": "#123456"}}).value["marks"]["Pie"] == {"fill": "#123456"}
    # The gallery's Python example: a pie, a keyed donut, and a row of pies in a Facet.
    example = runpy.run_path(str(Path(__file__).resolve().parents[1] / "examples" / "72_pie.py"))
    state, _ = example["scene"]._snapshot()
    row, facet = state["root"]["children"]
    pie, donut = (plot["children"][0] for plot in row["children"])
    assert (pie["kind"], pie["props"]["sectorLabel"], donut["props"]["innerRadius"]) == ("Pie", "percent", 0.55)
    assert facet["kind"] == "Facet" and facet["children"][0]["children"][0]["kind"] == "Pie"
    example["next_month"]()


def test_partition_repeats_children_and_refuses_a_nested_facet():
    with hm.Scene() as scene:
        with hm.Data(hm.Table({"x": [1.0, 2.0], "g": ["a", "b"]})):
            with hm.Plot():
                with hm.Partition(by="g", legend_groups=True) as partition:
                    hm.Points(x="x", y="x")
    assert partition.props["by"] == "g"
    assert partition.props["legendGroups"] is True
    state, _ = scene._snapshot()
    node = state["root"]["children"][0]["children"][0]["children"][0]
    assert node["kind"] == "Partition"
    assert node["props"] == {"by": "g", "legendGroups": True}
    assert [child["kind"] for child in node["children"]] == ["Points"]
    with pytest.raises(TypeError, match="partition inside the Facet"):
        with hm.Partition(by="g"):
            hm.Facet(column="g")
    with pytest.raises(TypeError, match="partition inside the Facet"):
        with hm.Partition(by="g"):
            with hm.Plot():
                hm.Facet(column="g")


def test_partition_refuses_a_prebuilt_subtree_that_holds_a_facet():
    # 11.11 A9: the guard walks the added subtree, not only the node being added.
    prebuilt = hm.Plot()
    prebuilt.add(hm.Facet(column="g"))
    partition = hm.Partition(by="g")
    with pytest.raises(TypeError, match="Facet cannot be nested inside Partition; partition inside the Facet"):
        partition.add(prebuilt)
    assert partition.children == [] and prebuilt.parent is None
    # Deeper: the Facet two levels down in the added subtree.
    with hm.Plot() as deep:
        with hm.Frame():
            hm.Facet(column="g", layout="bands")
    with pytest.raises(TypeError, match="partition inside the Facet"):
        partition.add(deep)
    # The same subtree without a Facet is accepted, and a Partition inside a Facet stays fine.
    partition.add(hm.Plot())
    with hm.Facet(column="g") as facet:
        with hm.Plot():
            hm.Partition(by="h")
    assert facet.children[0].children[0].kind == "Partition"


def test_partition_by_a_numeric_column():
    # 11.11 A3: a numeric key (Python sends it as a numeric column, not a dictionary) is a valid
    # `by`; the browser groups by its distinct values, ascending.
    cars = {"hp": np.array([110.0, 93.0, 175.0, 105.0]), "cyl": np.array([6, 4, 8, 6])}
    with hm.Scene() as scene:
        with hm.Plot(data=cars):
            with hm.Partition(by="cyl", limit=8) as partition:
                hm.Line(x="hp", y="hp")
    state, _ = scene._snapshot()
    node = state["root"]["children"][0]["children"][0]
    assert node["kind"] == "Partition" and node["props"] == {"by": "cyl", "limit": 8}
    table = next(iter(state["tables"].values()))
    cyl = state["columns"][table["columns"]["cyl"]["$column"]]
    assert cyl["logical_type"] == "numeric" and "categories" not in cyl
    assert partition.props["by"] == "cyl"
    # Several keys, numeric and categorical, serialize as a list in `by` order.
    with hm.Scene() as scene:
        with hm.Plot(data={**cars, "gear": ["a", "b", "a", "b"]}):
            hm.Partition(by=["cyl", "gear"])
    state, _ = scene._snapshot()
    assert state["root"]["children"][0]["children"][0]["props"] == {"by": ["cyl", "gear"]}


@pytest.mark.asyncio
async def test_partition_groups_command_round_trips_through_the_transport():
    # 11.11 C6: `await partition.groups()` sends a `groups` command to the Partition and
    # returns the browser's reply unchanged.
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [1.0, 2.0, 3.0], "g": ["a", "b", "a"]}) as plot:
            with hm.Partition(by="g") as outer:
                with hm.Partition(by="h", legend_groups=True) as partition:
                    hm.Points(x="x", y="x", name="Points")
    scene._views["test"] = {"ready": True, "revision": scene.revision}
    reply = [
        {"key": '["x"]', "values": {"g": "a", "h": "x"}, "label": "x", "marks": ["Points"]},
        {"key": "[null]", "values": {"g": "a", "h": None}, "label": "(missing)", "marks": ["Points"]},
    ]

    class Transport:
        def __init__(self):
            self.messages = []

        def send(self, message):
            self.messages.append(message)
            if message.get("type") != "command" or message.get("command") != "groups":
                return
            if message["target"] == partition.id:
                scene._receive({"type": "result", "scene": scene.id, "request": message["request"], "value": reply}, [])
            else:
                scene._receive({"type": "error", "scene": scene.id, "request": message["request"],
                                "revision": scene.revision, "message": "Target is not a Partition."}, [])

    scene._widget = Transport()
    groups = await partition.groups(timeout=1)
    assert groups == reply
    sent = [m for m in scene._widget.messages if m.get("command") == "groups"][-1]
    assert sent["type"] == "command" and sent["target"] == partition.id and sent["view"] == "test"
    assert set(sent["args"]) == {"timeoutMs"}
    assert outer.id != partition.id
    with pytest.raises(hm.SceneError, match="Target is not a Partition."):
        await plot.groups(timeout=1)


def test_an_event_from_inside_a_partition_carries_the_group():
    # 11.11 A2: the browser names the Partition group (and the facet cell, separately) on
    # events from a mark repeated by a Partition; Python exposes both on the event.
    seen = []
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [1.0, 2.0], "g": ["a", "b"]}):
            with hm.Partition(by="g"):
                points = hm.Points(x="x", y="x")
    points.on_click(lambda event: seen.append((event.partition_group, getattr(event, "facet_cell", None))))
    scene._views["v"] = {"ready": True}
    scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision,
                    "target": points.id, "event": "click",
                    "payload": {"source_index": 0, "partition_group": '["a"]'}}, [])
    assert seen == [('["a"]', None)]


def test_reductions_serialize_and_parameterize_transforms():
    from hmplot.expressions import _REDUCTIONS

    assert set(_REDUCTIONS) == {"mean", "sum", "count", "min", "max", "std", "var",
                                "median", "mode", "first", "last", "any", "all"}
    grouped = hm.mean("bill_length", by=["species", "sex"])
    assert grouped.op == "mean"
    assert grouped.args[1] == {"$expression_options": {"by": ["species", "sex"]}}
    assert hm.var("x").op == "variance"
    with pytest.raises(TypeError, match="column name"):
        hm.mean("x", by=7)
    with hm.Scene() as scene:
        with hm.Data(hm.Table({"x": [1.0, 2.0, 3.0], "g": ["a", "a", "b"]})):
            with hm.Plot():
                with hm.stats.Bin(x="x", bins=hm.count("x") ** 0.5):
                    hm.Rect(x0="x0", x1="x1", y0=0, y1="count")
                with hm.Calculate(z=(hm.col.x - hm.mean("x", by="g")) / hm.std("x", by="g")):
                    hm.Points(x="x", y="z")
    state, _ = scene._snapshot()
    plot = state["root"]["children"][0]["children"][0]
    binned = plot["children"][0]["props"]["bins"]
    assert binned["$expression"]["op"] == "power"
    assert binned["$expression"]["args"][0]["$expression"]["op"] == "count"
    z = plot["children"][1]["props"]["columns"]["z"]["$expression"]
    assert z["op"] == "divide"
    assert z["args"][1]["$expression"]["args"][1] == {"$expression_options": {"by": "g"}}


def test_extent_is_a_domain_of_min_and_max_where():
    # TODO 136.14 slice 4: a domain read from the data, re-read in the browser as the brush moves.
    with hm.Scene() as scene:
        hm.Plot(hm.Points(x="x", y="y"), data={"x": [1, 2], "y": [3, 4]}, x={"domain": hm.extent("x", where="@brushed")})
    domain = scene._snapshot()[0]["root"]["children"][0]["props"]["x"]["domain"]
    assert [end["$expression"]["op"] for end in domain] == ["min", "max"]
    assert all(end["$expression"]["args"][2] == "@brushed" for end in domain)


def test_star_import_keeps_the_builtins_and_hm_keeps_min_max_sum():
    # 12C A5: min, max, and sum stay out of __all__, so a star import does not shadow them;
    # round too (TODO 28).
    namespace = {}
    exec("from hmplot import *", namespace)
    for name in ("sum", "min", "max", "round", "any", "all"):
        assert name not in namespace
    assert "mean" in namespace and "count" in namespace and "floor" in namespace and "interval" in namespace
    exec("total = sum([1, 2, 3]); largest = max(3, 5); half = round(2.5)", namespace)
    assert (namespace["total"], namespace["largest"], namespace["half"]) == (6, 5, 2)
    for name in ("sum", "min", "max", "round", "any", "all"):
        assert name not in hm.__all__
        assert isinstance(getattr(hm, name)("x"), hm.Expression)
    assert hm.min("x").op == "min" and hm.sum("x", by="g").op == "sum" and hm.round("x").op == "round"


def test_reductions_other_than_count_need_a_value():
    # 12C A6: raised at construction rather than at render time.
    for name in ("mean", "sum", "min", "max", "std", "var", "median", "mode", "first", "last"):
        with pytest.raises(TypeError, match=rf"{name}\(\) needs a column or expression to reduce"):
            getattr(hm, name)()
        with pytest.raises(TypeError, match="needs a column"):
            getattr(hm, name)(by="g")
    assert hm.count().args == (None,)
    assert hm.count(by="g").args[1] == {"$expression_options": {"by": "g"}}


def test_data_derived_parameters_are_typed_not_any():
    # 12C B3: Bin.bins and friends keep their arrays, rule names, and per-axis objects.
    import inspect
    bins = inspect.signature(hm.stats.Bin).parameters["bins"].annotation
    # 40.2: arrays are Sequence, so a list of ints type-checks.
    assert "Expression" in bins and "Sequence[float]" in bins and '"sturges"' in bins and "dict[str" in bins
    assert "Any" not in inspect.signature(hm.charts.Histogram).parameters["bins"].annotation
    bandwidth = inspect.signature(hm.Density).parameters["bandwidth"].annotation
    assert "Expression" in bandwidth and "Any" not in bandwidth
    from pathlib import Path
    stub = Path(hm.__file__).with_name("stats.pyi").read_text()
    # Union members come in TypeScript's order, which is not the source order.
    line = next(line for line in stub.splitlines() if line.strip().startswith("bins: float | TypingLiteral"))
    assert all(part in line for part in ('TypingLiteral["auto", "sturges", "fd", "scott"]', "Sequence[float]", "Expression"))


def test_a_single_value_filter_condition_comes_back_as_a_scene_error():
    # 12C C5: the browser rejects hm.Filter(where=hm.mean("x")) (tests/browser/reductions.spec.js
    # checks the message and the payload the widget sends); here that payload reaches the scene.
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [1.0, 2.0, 3.0, 6.0], "y": [0.0, 1.0, 2.0, 3.0]}):
            with hm.Filter(where=hm.mean("x")):
                hm.Points(x="x", y="y")
    state, _ = scene._snapshot()
    where = state["root"]["children"][0]["children"][0]["props"]["where"]
    assert where == {"$expression": {"op": "mean", "args": ["x"]}}
    message = ("Filter condition must be one value per row; a reduction is a single value, "
               "so compare it (x > mean(x)).")
    scene._receive({"type": "error", "scene": scene.id, "view": "v", "message": message,
                    "code": "frontend", "diagnostic": {}, "revision": scene.revision}, [])
    assert scene.error == message and not scene.pending


def test_named_bin_rules_reach_the_snapshot():
    with hm.Scene() as scene:
        with hm.Plot(data={"x": [1.0, 2.0, 3.0]}):
            hm.charts.Histogram(x="x", bins="sturges")
    state, _ = scene._snapshot()
    assert state["root"]["children"][0]["children"][0]["props"]["bins"] == "sturges"


def test_animate_and_tween_serialize_and_validate():
    from hmplot.exporter import _frame_times

    a = hm.animate("y", duration=500, easing="linear", enter=0, exit=10)
    assert isinstance(a, hm.Animate)
    with pytest.raises(TypeError):
        a * 2
    with pytest.raises(TypeError):
        bool(a)
    with pytest.raises(TypeError, match="easing"):
        hm.animate("y", easing="bouncy")
    with pytest.raises(TypeError, match="wrap another"):
        hm.animate(hm.animate("y"))
    t = hm.tween("x", duration=200)
    assert t.op == "tween" and t.args[1] == {"$expression_options": {"duration": 200}}
    with pytest.raises(TypeError, match=r"only animate\(\) supports enter and exit"):
        hm.tween("x", enter=0)
    with hm.Scene() as scene:
        with hm.Data(hm.Table({"x": [1.0, 2.0], "y": [1.0, 2.0]}, key=None)):
            with hm.Plot():
                hm.Points(x="x", y=a, size=hm.tween("x") * 2)
    state, _ = scene._snapshot()
    mark = state["root"]["children"][0]["children"][0]["children"][0]
    assert mark["props"]["y"] == {"$animate": {"value": "y", "duration": 500, "easing": "linear", "enter": 0, "exit": 10}}
    assert mark["props"]["size"]["$expression"]["args"][0]["$expression"]["op"] == "tween"
    with pytest.raises(TypeError, match=r"Calculate column z: animate\(\) belongs on a mark channel"):
        with hm.Plot():
            hm.Calculate(z=hm.animate("x"))
    with pytest.raises(TypeError, match=r"Filter\.where: animate\(\) must be the outermost operator on a mark channel"):
        hm.Filter(where=hm.animate("x"))
    assert isinstance(hm.Mapping(y=hm.animate("y")).props["y"], hm.Animate)
    assert _frame_times(0, 1000, 10) == [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]
    assert _frame_times(500, 100, 30) == [500, 500 + 1000 / 30, 500 + 2000 / 30]
    with pytest.raises(ValueError):
        _frame_times(0, 0, 30)


def test_mark_lists_derive_from_the_registry():
    # 10.9 A5: the signature generator writes its mark set into the registry, and every
    # Python mark list reads it, so a new mark such as Lollipop cannot be missed by hand.
    from hmplot.core import DISPLAYABLE_MARKS, DIRECT_DATA_MARKS
    marks = set(hm.REGISTRY["marks"])
    assert "Lollipop" in marks and "Histogram" in marks
    assert DISPLAYABLE_MARKS | DIRECT_DATA_MARKS == marks
    assert DISPLAYABLE_MARKS.isdisjoint(DIRECT_DATA_MARKS)
    # A Lollipop with data inside a Plot is wrapped in a Data scope like any other mark, and a
    # standalone one is wrapped in a Plot.
    with hm.Scene() as scene:
        with hm.Plot():
            hm.charts.Lollipop(data={"c": ["a", "b"], "v": [1.0, -2.0]}, x="c", y="v")
    state, _ = scene._snapshot()
    scope = state["root"]["children"][0]["children"][0]
    assert scope["kind"] == "Data" and scope["children"][0]["kind"] == "Lollipop"
    assert "data" not in scope["children"][0]["props"]
    alone = hm.charts.Lollipop(data={"c": ["a", "b"], "v": [1.0, -2.0]}, x="c", y="v")
    state, _ = alone._scene()._snapshot()
    assert state["root"]["children"][0]["kind"] == "Plot"
    assert hm.create_theme(marks={"Lollipop": {"size": 40, "color": "#00aa00", "width": 8}}).value["marks"]["Lollipop"]["width"] == 8


def test_fold_facet_by_the_key_snapshot_is_plain_fold_and_facet_nodes():
    # Per-field cells for a Facet split by a Fold's key (each cell over the source rows, its
    # value column aliasing the field, like Pairs) are built by the shared JavaScript
    # partitioner. Python sends the scene unchanged: the Facet directly inside the Fold,
    # split by the key, with brushable marks and a keyless connector over the repeated Anchor.
    with hm.Scene() as scene:
        with hm.Plot(data={"id": [1, 2], "a": [1.0, 2.0], "b": [3.0, 4.0]}):
            with hm.Fold(fields=["a", "b"]) as fold:
                with hm.Facet(column="key", scales="free-y", layout="grid") as facet:
                    hm.Anchor(x=0, y="value", name="values")
                    hm.Points(x=0, y="value", brush={"axis": "y"})
                hm.Line(connections=hm.connect(facet.endpoint("values"), order="facet"))
    state, _ = scene._snapshot()

    def shape(node):
        return {"kind": node["kind"], "props": node["props"],
                "children": [shape(child) for child in node.get("children", [])]}

    [plot] = state["root"]["children"]
    [fold_node] = plot["children"]
    assert fold_node["id"] == fold.id
    assert shape(fold_node) == {"kind": "Fold", "props": {"fields": ["a", "b"]}, "children": [
        {"kind": "Facet", "props": {"column": "key", "scales": "free-y", "layout": "grid"}, "children": [
            {"kind": "Anchor", "props": {"x": 0, "y": "value", "name": "values"}, "children": []},
            {"kind": "Points", "props": {"x": 0, "y": "value", "brush": {"axis": "y"}}, "children": []},
        ]},
        {"kind": "Line", "props": {"connections": {"$connect": {
            "version": 1, "key": None, "order": "facet",
            "endpoints": [{"scope": {"$ref": facet.id}, "name": "values", "at": None}],
        }}}, "children": []},
    ]}


def test_inputs_are_read_by_name_checked_and_synced():
    assert hm.Select(name="empty", options=["a"], multiple=True).value == []
    with pytest.raises(AttributeError, match=r"Select\(multiple=True"):
        hm.MultiSelect
    # TODO 41: inputs send their values up to the input context (the Scene, an InputContext, a
    # Template instance); everything in it reads them by name.
    data = {"a": [1.0, 2.0, 3.0], "b": [3.0, 1.0, 2.0], "s": ["x", "y", "x"]}
    with hm.Scene() as scene:
        with hm.Row(wrap=True, min_width=0):
            threshold = hm.Slider(name="threshold", min=0, max=3, value=1.5)
            metric = hm.Select(name="metric", options=["a", "b"])
            chosen = hm.Select(multiple=True, name="chosen", options=["x", "y"], value=["x"])
        with hm.Data(data):
            with hm.Filter(where=(hm.col.a > hm.input.threshold) & hm.is_in(hm.col.s, hm.input.chosen)):
                with hm.Plot(title=hm.input.metric):
                    hm.Points(x="$metric", y="b")
    assert isinstance(threshold, hm.Input) and (threshold.value, metric.value, chosen.value) == (1.5, "a", ["x"])
    where = scene._snapshot()[0]["root"]["children"][1]["children"][0]["props"]["where"]
    # hm.input.threshold is an input node (R2.0), not a column named $threshold.
    assert '{"op": "input", "args": ["threshold"]}' in json.dumps(where) and '{"op": "input", "args": ["chosen"]}' in json.dumps(where)
    # The viewer's value comes back without a new revision; a stale message is ignored.
    changes = []
    threshold.on_change(lambda event: changes.append(event.value))
    scene._views["v"] = {"ready": True}
    revision = scene.revision
    for value, sequence in ((2.5, 2), (0.5, 1)):
        scene._receive({"type": "input", "scene": scene.id, "view": "v", "revision": revision,
                        "target": threshold.id, "value": value, "sequence": sequence}, [])
    assert threshold.value == 2.5 and changes == [2.5] and scene.revision == revision
    # Another view of the scene is told, not the one that sent it.
    sent = []
    scene._widget = type("Widget", (), {"send": lambda self, message: sent.append(message)})()
    scene._views["w"] = {"ready": True}
    scene._receive({"type": "input", "scene": scene.id, "view": "v", "revision": revision,
                    "target": threshold.id, "value": 2.0, "sequence": 3}, [])
    assert [(m["view"], m["target"], m["value"]) for m in sent] == [("w", threshold.id, 2.0)]
    scene._widget = None
    # Assigning sets it in every view: a new revision carries it.
    threshold.value = 1.0
    assert threshold.props["value"] == 1.0 and scene.revision == revision + 1
    # A misspelled read names the reader and the inputs in view.
    with pytest.raises(ValueError, match=r"Filter\.where reads \$treshold, but no input named 'treshold'.*inputs here: k"):
        with hm.Scene():
            hm.Slider(name="k")
            with hm.Data(data):
                with hm.Filter(where=hm.col.a > hm.input.treshold):
                    hm.Plot()
    with pytest.raises(ValueError, match="is inside a Plot"):
        with hm.Scene():
            with hm.Plot():
                hm.Slider(name="k")
    with pytest.raises(ValueError, match="Two inputs are named 'k'"):
        with hm.Scene():
            hm.Slider(name="k")
            hm.Checkbox(name="k")
    # An InputContext keeps its names inside; a title's "$GDP" is a title.
    with pytest.raises(ValueError, match=r"reads \$k"):
        with hm.Scene():
            with hm.InputContext():
                hm.Slider(name="k")
            with hm.Data(data):
                with hm.Filter(where=hm.col.a > hm.input.k):
                    hm.Plot()
    with hm.Scene():
        hm.Plot(title="$GDP")

    # Each Template instance is an input context, so two panels with a slider of one name coexist.
    @hm.template
    def panel(table):
        hm.Slider(name="k", min=0, max=3)
        with hm.Data(table):
            with hm.Filter(where=hm.col.a > hm.input.k):
                hm.Plot()

    with hm.Scene():
        panel(data)
        panel(data)


def test_shift_field_reads_inputs_like_other_transform_columns():
    # Shift's field names a column, as Normalize's and Window's do: "$name" there reads an input,
    # so a misspelled name is an error and visualize_tree lists the input (or column) it reads.
    from hmplot.introspection import _reads
    data = {"t": [1.0, 2.0], "y": [3.0, 4.0]}
    with pytest.raises(ValueError, match=r"Shift\.field reads \$colx, but no input named 'colx'.*inputs here: col"):
        with hm.Scene():
            hm.Select(name="col", options=["t", "y"])
            with hm.Data(data):
                with hm.Shift(field="$colx", interval=1):
                    hm.Plot()
    assert _reads(hm.Shift(field="$col", interval=1)) == ([], ["col"])
    assert _reads(hm.Shift(field="t", interval=1)) == (["t"], [])


def test_inputs_read_their_options_and_range_from_the_data():
    # TODO 41.2: options and bounds as expressions over the Data scope around the input.
    data = {"x": [3.0, -1.0, 2.0], "species": ["b", "a", "b"]}
    with hm.Scene():
        with hm.Data(data):
            species = hm.Select(name="species", options=hm.categories("species"))
            start = hm.Slider(name="start", min=hm.min("x"), max=hm.max("x"))
            columns = hm.Select(name="metric", options=hm.column_names(), value="x")
            with hm.Filter(where=(hm.col.species == hm.input.species) & (hm.col.x >= hm.input.start)):
                hm.Plot()
    # Known once the browser has read the data and sent them; a given value is known at once.
    assert (species.value, start.value, columns.value) == (None, None, "x")
    assert species.props["options"].op == "categories" and columns.props["options"].op == "columns"
    with pytest.raises(ValueError, match=r"min and max read the data, so it needs a Data scope"):
        with hm.Scene():
            hm.Slider(name="start", min=hm.min("x"), max=hm.max("x"))


def test_simulate_checks_its_state_and_follows_the_browser():
    # TODO 42: hm.prev.x reads a state column, hm.view.dt the step; an update of a column without an
    # initial value, or a read of one, is an error when the scene is built; the browser's status
    # messages set step_count, running and settled.
    data = {"x0": [1.0, 2.0], "y": [0.0, 1.0]}
    with hm.Scene() as scene:
        hm.Button(name="kick")
        with hm.Data(data):
            with hm.Simulate(initial={"x": "x0", "v": 0}, reset=hm.input.kick,
                             update={"v": hm.prev.v - hm.prev.x * hm.view.dt, "x": hm.prev.x + hm.prev["v"] * hm.view.dt}) as sim:
                with hm.Plot():
                    hm.Points(x="x", y="y")
    props = scene._snapshot()[0]["root"]["children"][1]["children"][0]["props"]
    assert props["update"]["x"] == {"$expression": {"op": "add", "args": [
        {"$expression": {"op": "column", "args": ["@prev:x"]}},
        {"$expression": {"op": "multiply", "args": [{"$expression": {"op": "column", "args": ["@prev:v"]}},
                                                    {"$expression": {"op": "state", "args": ["dt"]}}]}}]}}
    assert (sim.step_count, sim.running, sim.settled) == (0, True, False)
    scene._receive({"type": "simulate", "scene": scene.id, "target": sim.id, "revision": scene.revision - 1, "steps": 9, "settled": True}, [])
    assert sim.step_count == 0
    scene._receive({"type": "simulate", "scene": scene.id, "target": sim.id, "revision": scene.revision, "steps": 240,
                    "running": False, "settled": True}, [])
    assert (sim.step_count, sim.running, sim.settled) == (240, False, True)
    for update, stop, message in [({"z": hm.prev.x}, None, "update['z'] has no initial value"),
                                  ({"x": hm.prev.z}, None, "reads hm.prev.z, which is not a state column"),
                                  ({"x": 1}, {"tolerance": 0.1, "columns": ["v"]}, "names 'v', which is not a state column")]:
        with pytest.raises(ValueError, match=re.escape(message)):
            with hm.Scene():
                with hm.Data(data):
                    with hm.Simulate(initial={"x": "x0"}, update=update, stop=stop):
                        hm.Plot()


def test_playback_plays_pauses_and_resets_from_python():
    # TODO 41.4: play()/pause() set playing and reset() bumps reset, each a new revision; the
    # viewer's play or pause comes back without one.
    data = {"year": [2000.0, 2005.0, 2010.0]}
    with hm.Scene() as scene:
        with hm.Data(data):
            year = hm.Playback(name="year", min=2000, max=2010, step=5, rate=10, loop=True)
            with hm.Filter(where=hm.col.year == hm.input.year):
                hm.Plot()
    assert isinstance(year, hm.Input) and year.value == 2000 and not year.playing
    revision = scene.revision
    year.play()
    assert year.playing and scene.revision == revision + 1
    year.pause()
    year.reset()
    assert not year.playing and year.props["reset"] == 1 and scene.revision == revision + 3
    scene._views["v"] = {"ready": True}
    scene._receive({"type": "input", "scene": scene.id, "view": "v", "revision": scene.revision,
                    "target": year.id, "playing": True, "sequence": 1}, [])
    assert year.playing and scene.revision == revision + 3


def test_names_in_a_column_place_are_their_own_nodes():
    """R2.0: hm.col, hm.input and hm.view are expression nodes of their own; hm.view is a
    closed set; hm.col.x names a column wherever a column's name goes."""
    assert (hm.col("$price").op, hm.col("$price").args) == ("column", ("$price",))
    for name in ("@brush_min:weight", "@brush_max:weight"):
        assert (hm.col(name).op, hm.col(name).args) == ("column", (name,))
    with pytest.raises(TypeError, match="cannot start with @"):
        hm.col("@brush_min:")
    assert (hm.input.bins.op, hm.view.time.op, hm.view.dt.args) == ("input", "state", ("dt",))
    with pytest.raises(TypeError, match=r"cannot start with @, which names state: use hm\.view\.time"):
        hm.col("@time")
    with pytest.raises(AttributeError, match=r"hm\.view has no 'selcted'\. State names are selected"):
        hm.view.selcted
    assert "pointer_x" in dir(hm.view) and not hasattr(hm, "dt")
    # One list of state names in both languages (hover's is "hovered" since TODO 72.5).
    assert hm.view.hovered.args == ("hovered",) and "highlighted" not in hm.STATE_NAMES
    from pathlib import Path
    source = Path(__file__).resolve().parents[2] / "src/lib/plot/utils/names.js"
    if source.exists():
        js = re.search(r"STATE_NAMES = Object\.freeze\(\[(.*?)\]\)", source.read_text(), re.S).group(1)
        assert list(hm.STATE_NAMES) == re.findall(r'"(\w+)"', js)
    assert hm.mean("v", by=[hm.col.g, ":h"]).args[1] == {"$expression_options": {"by": ["g", "h"]}}
    assert hm.moved(hm.col.w).args == ("w",) and hm.categories(hm.col.s).args == ("s",)
    with hm.Scene() as scene:
        with hm.Data({"g": ["a", "b"], "v": [1.0, 2.0]}):
            with hm.Facet(row=hm.col.g):
                with hm.Sort(by=hm.col.v):
                    with hm.Plot():
                        hm.Points(x="v", y="v", fill=hm.view.brushed)
    facet = scene._snapshot()[0]["root"]["children"][0]["children"][0]
    sort = facet["children"][0]
    assert facet["props"]["row"] == "g"
    assert sort["props"]["by"] == {"$expression": {"op": "column", "args": ["v"]}}
    assert sort["children"][0]["children"][0]["props"]["fill"] == {"$expression": {"op": "state", "args": ["brushed"]}}


def test_interaction_columns_are_at_names_of_selections():
    """TODO 64: an Interaction names its selections "@focus", which expressions and Filter read
    as strings; a name without @, or a state name, is refused when the scene is built."""
    focus = hm.selection()
    with hm.Data({"x": [1, 2]}) as table:
        with hm.Interaction(columns={"@focus": focus}):
            with hm.Plot():
                with hm.Filter(where="@focus"):
                    hm.Points(x="x", y="x", size=hm.where("@focus", 16, 8))
    table._scene()._validate()
    for name in ("focus", "@selected"):
        with pytest.raises(ValueError, match=r'Interaction: a column\'s name is "@" and a name that is not a state name'):
            with hm.Data({"x": [1, 2]}):
                with hm.Interaction(columns={name: focus}):
                    with hm.Plot():
                        hm.Points(x="x", y="x")


def test_casts_and_typed_columns_serialize():
    """R2.0 "Types": casts carry their options; typed_column is the typed column (hm.Column is
    the layout)."""
    assert hm.as_category("zip", domain=["02134", "10001"]).args == ("zip", {"$expression_options": {"domain": ["02134", "10001"]}})
    assert hm.as_datetime("t", unit="s", timezone="UTC").args[1] == {"$expression_options": {"unit": "s", "timezone": "UTC"}}
    assert hm.as_numeric("x").args[1] == {"$expression_options": {}} and hm.as_ordinal("r").op == "as_ordinal"
    with pytest.raises(ValueError, match="unique"):
        hm.as_category("x", domain=[1, 1])
    with pytest.raises(ValueError, match="unit is one of"):
        hm.as_duration("x", unit="weeks")
    assert hm.typed_column([1, 2], type="ordinal").logical_type == "ordinal"
    assert not hasattr(hm, "column") and hm.Column.__module__ == "hmplot"


def test_keywords_are_snake_case_and_a_channel_scale_is_one_object():
    """R2.0: a camelCase keyword names its snake_case spelling. TODO 137.4: a channel's scale is
    one object; the flat per-channel keys are errors naming it."""
    with pytest.raises(TypeError, match=r"'selectionOpacity' is spelled 'selection_opacity' in Python"):
        hm.Points(x=[1], y=[1], selectionOpacity=0.2)
    with pytest.raises(TypeError, match=r"unknown property 'value_bounds'"):
        hm.Points(x=[1], y=[1], value_bounds=[0, 1])
    with pytest.raises(TypeError, match=r"Points: unknown property 'fill_domain'\. A channel's scale is one object: "
                       r"fill_scale=hm\.continuous\(domain=\[lo, hi\]\) \(hm\.categorical\(domain=\.\.\.\) for categories\)\."):
        hm.Points(x=[1], y=[1], fill_domain=[0, 1])
    with pytest.raises(TypeError, match=r"Points: unknown property 'fillDomain'\. A channel's scale is one object: fill_scale="):
        hm.Points(x=[1], y=[1], fillDomain=[0, 1])
    with pytest.raises(TypeError, match=r"Points: unknown property 'height_range'\.$"):
        hm.Points(x=[1], y=[1], height_range=[0, 1])
    with pytest.raises(TypeError, match=r"size_scale=hm\.continuous\(range=\[lo, hi\]\)"):
        hm.Points(x=[1], y=[1], size_range=[2, 9])
    with pytest.raises(TypeError, match=r"GeoJSON: unknown property 'height_range'\. .* height_scale=hm\.continuous\(range=\[lo, hi\]\)\.$"):
        hm.GeoJSON(data={"type": "FeatureCollection", "features": []}, height_range=[0, 1])
    points = hm.Points(x=[1], y=[1], fill=[2], colormap="RdBu", size_scale=hm.continuous(range=[2, 9]))
    assert points.props["colormap"] == "RdBu"
    assert hm.continuous(domain="symmetric").normalization.snapshot()["domain"] == "symmetric"


def test_display_scale_is_the_minimaps_alone():
    """TODO 137.5: marks and the Plot have no display_scale; their size and width say it. The
    Minimap keeps its own, the overview's multiplier."""
    with pytest.raises(TypeError, match=r"Points: unknown property 'display_scale'\. Set the marks' pixel sizes \(size, width, outline_width"):
        hm.Points(x=[1], y=[1], display_scale=2)
    with pytest.raises(TypeError, match=r"Plot: unknown property 'display_scale'\. Set the marks' pixel sizes"):
        hm.Plot(display_scale=2)
    with pytest.raises(TypeError, match=r"Mapping: unknown property 'display_scale'\. Set the marks' pixel sizes"):
        hm.Mapping(display_scale=2)
    assert hm.Minimap(display_scale=0.5).props["displayScale"] == 0.5


def test_range_text_color_datetime_inputs_defaults_and_roundtrip():
    import datetime
    with pytest.raises(AttributeError, match=r"Use hm.Slider\(value="):
        hm.RangeSlider
    with hm.Scene() as scene:
        interval = hm.Slider(name="interval", min=2, max=8, value=[2, 8])
        text = hm.TextInput(name="caption", placeholder="Title")
        color = hm.ColorPicker(name="ink")
        date = hm.DateTimeInput(name="cutoff", timezone="America/New_York")
        with hm.Plot(x={"domain": hm.input.interval}, title=hm.input.caption):
            hm.Points(x=[3, 5], y=[1, 2], fill=hm.input.ink)
    assert all(isinstance(control, hm.Input) for control in (interval, text, color, date))
    assert (interval.value, text.value, color.value, date.value) == ([2, 8], "", "#000000", None)
    scene._snapshot()
    changes = []
    scene._views["v"] = {"ready": True}
    for control, value in [(interval, [3, 7]), (text, "New title"), (color, "#ff0000"),
                           (date, {"$datetime": 1717245000000, "timezone": "America/New_York"})]:
        control.on_change(lambda event: changes.append(event.value))
        scene._receive({"type": "input", "scene": scene.id, "view": "v", "revision": scene.revision,
                        "target": control.id, "value": value, "sequence": 1}, [])
    assert (interval.value, text.value, color.value) == ([3, 7], "New title", "#ff0000")
    assert isinstance(date.value, datetime.datetime) and len(changes) == 4
    date.value = None
    text.value = ""
    assert date.value is None and text.value == ""


def test_plot_sizing_leaves_responsive_choice_to_the_renderer():
    plot = hm.Plot(width=620)
    assert plot.props["width"] == 620
    assert plot.props["height"] == 450
    assert "responsive" not in plot.props
    plot.update(width=500)
    assert "responsive" not in plot.props
    assert hm.Plot(responsive=True).props["responsive"] is True
    assert hm.Plot(axes2d=False).props["axes2d"] is False


def test_predicate_and_ordered_column_expression_contracts():
    selected = hm.first("name", where="@selected", order_by="date")
    assert selected.args[1] == {"$expression_options": {"orderBy": "date", "order": "asc"}}
    assert selected.args[2] == "@selected"
    assert hm.any(hm.col.x > 1, where=hm.col.keep).op == "any"
    assert hm.all(hm.col.x, by="g").op == "all"
    running = hm.cumsum("amount", by=[hm.col.g], order_by=[hm.col.date], order="desc")
    assert running.args[1]["$expression_options"] == {"by": ["g"], "orderBy": ["date"], "order": "desc"}
    assert hm.lag("amount", periods=0, fill=0).args[1]["$expression_options"]["periods"] == 0
    assert hm.window("amount", size=hm.input.width, reduce="any").args[2].op == "input"
    assert hm.lookup("x", "parent", fill=0).args == ("x", "parent", {"$expression_options": {"fill": 0}})
    with pytest.raises(TypeError, match="lookup"):
        hm.lookup("x", None)
    for build in (hm.lag, hm.lead):
        with pytest.raises(TypeError, match="nonnegative"):
            build("x", periods=-1)
    with pytest.raises(TypeError, match="positive integer"):
        hm.window("x", size=0)
    with pytest.raises(TypeError, match=r"mean\(\).*unexpected keyword argument 'order_by'"):
        hm.mean("x", order_by="date")
    with hm.Scene() as scene:
        with hm.Data(hm.Table({"amount": [1., 2., 3.], "g": ["a", "a", "b"], "date": [3., 1., 2.]})):
            with hm.Plot():
                with hm.Calculate(running=running, difference=hm.col.amount - hm.lag("amount", fill=0),
                                  rolling=hm.window("amount", size=2, reduce="all"), first=hm.lookup("amount", 0)):
                    hm.Points(x="date", y="running")
    state, _ = scene._snapshot()
    columns = state["root"]["children"][0]["children"][0]["children"][0]["props"]["columns"]
    assert columns["running"]["$expression"]["op"] == "cumsum"
    assert columns["rolling"]["$expression"]["args"][2] == 2
    assert columns["first"]["$expression"]["args"] == ["amount", 0, {"$expression_options": {"fill": None}}]


def test_mark_shade():
    """TODO 138.3: a mark's shade names a plugin's kind and its parameters; the browser checks them."""
    assert hm.shade("hatch", spacing=6, ink=None) == {"kind": "hatch", "spacing": 6}
    points = hm.Points(x=[1, 2], y=[3, 4], shade=hm.shade("hatch", spacing=6))
    assert points.props["shade"] == {"kind": "hatch", "spacing": 6}
    assert hm.Points(x=[1], y=[1], shade=None).props.get("shade") is None
    assert hm.Points(x=[1], y=[1], shade=False).props.get("shade") is None
    assert hm.Points(x=[1], y=[1], shade={"kind": "hatch", "ink": None}).props["shade"] == {"kind": "hatch"}
    with pytest.raises(TypeError, match=r'Points: shade is hm.shade\(kind, ...\), as shade=hm.shade\("hatch", spacing=6\); got'):
        hm.Points(x=[1], y=[1], shade="hatch")
    with pytest.raises(TypeError, match="hm.shade takes the shade's kind first"):
        hm.shade(6)


def test_geojson_null_fill_replaces_line_component_and_round_trips():
    shapes = {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}
    with hm.Plot():
        mark = hm.GeoJSON(data=shapes, fill=None, color="red", width=2)
    state, _ = mark._scene()._snapshot()
    node = next(n for n in _flatten_nodes(state["root"]) if n["kind"] == "GeoJSON")
    assert node["props"]["fill"] is None
    assert node["props"]["color"] == "red"
    with pytest.raises(AttributeError, match=r"hm.GeoJSON\(fill=None"):
        hm.GeoJSONLine(data=shapes)


def test_y_up_view_preset_uses_the_3d_presentation_contract():
    with hm.Plot(type="3d-y-up", camera_up=[1, 0, 0], effects=[hm.effect("sky")]) as plot:
        hm.Points3D(x=[0], y=[0], z=[0])
    assert plot.props["type"] == "3d-y-up"
    assert plot.props["cameraUp"] == [1, 0, 0]
    with pytest.raises(ValueError, match="compatible 2D"):
        with hm.Scene():
            first = hm.Plot(type="3d-y-up")
            second = hm.Plot()
            hm.LinkViews(first, second)


def test_animation_group_scopes_keep_observation_keys_and_explicit_none():
    rows = hm.Table({"country": ["A", "A"], "year": [0, 1]}, key=["country", "year"])
    data = hm.Data(rows, animation_group="country")
    plot = hm.Plot(animation_group=["country"])
    inherited = hm.Frame()
    cleared = hm.Frame(animation_group=None)
    assert data.props["animationGroup"] == "country"
    assert plot.props["animationGroup"] == ["country"]
    assert "animationGroup" not in inherited.props
    assert "animationGroup" in cleared.props and cleared.props["animationGroup"] is None
    assert rows.key == ["country", "year"]


def test_marks_and_data_reference_a_transforms_output():
    # TODO 142.3/142.6: one pipeline's output read by two Plots, serialized as references.
    table = hm.Table({"k": ["a", "b", "a"], "v": [1, 2, 3]})
    with hm.Scene() as scene:
        with hm.Data(table):
            with hm.Filter(where=hm.col.v > 1):
                grouped = hm.Group(by="k", columns={"n": hm.count()})
        with hm.Row():
            with hm.Plot():
                points = hm.Points(data=grouped, x="k", y="n", select=True)
            with hm.Plot():
                with hm.Data(value=grouped):
                    hm.Points(x="k", y="n")
    state, _ = scene._snapshot()
    datas = []
    def find(n):
        if n.get("kind") == "Data":
            datas.append(n["props"]["value"])
        for child in n.get("children", []):
            find(child)
    find(state["root"])
    assert datas.count({"$ref": grouped.id}) == 2
    # A reference's interaction state is its source table's, for a mark under hm.Data(value=...) too.
    assert points.selection is table.selection
    referenced = [n for n in scene.children[1].children[1].children[0].children]
    assert referenced[0].selection is table.selection
    with pytest.raises(TypeError, match="has no output"):
        hm.Points(data=hm.Plot(), x="k")
    with pytest.raises(ValueError, match="not in this scene"):
        with hm.Scene():
            with hm.Plot():
                hm.Points(data=grouped, x="k", y="n")


def test_join_reads_a_transforms_live_output():
    # TODO 140: route geometry joined to a brushed Group's per-route statistics.
    flights = hm.Table({"route": ["a", "a", "b"], "delay": [10.0, 20.0, 5.0]})
    routes = hm.Table({"route": ["a", "b", "c"], "x": [0, 1, 2]})
    with hm.Scene() as scene:
        with hm.Data(flights):
            with hm.Filter(where="@brushed"):
                stats = hm.Group(by="route", columns={"flights": hm.count(), "delay": hm.mean("delay")})
        with hm.Plot(data=routes):
            with hm.Join(data=stats, on="route", fields=["flights"]):
                hm.Points(x="x", y="flights")
    state, _ = scene._snapshot()
    join = state["root"]["children"][1]["children"][0]
    assert join["kind"] == "Join" and join["props"]["data"] == {"$ref": stats.id}
    with pytest.raises(TypeError, match="has no output"):
        hm.Join(data=hm.Plot(), on="route")


def test_live_values_in_titles_and_numeric_text():
    # TODO 136.16 slice 4: an expression in an f-string is a live value of Title.text, kept with
    # its format; anywhere else it is an error. TODO 143.6: Text's format takes a d3 format.
    table = {"x": [1, 2, 3], "fare": [5.0, 7.5, 9.0]}
    with hm.Scene() as scene:
        with hm.Data(table):
            title = hm.Title(f"Selected: {hm.count(where='@brushed'):,} · mean {hm.mean('fare')}")
            with hm.Plot():
                hm.Points(x="x", y="fare", brush=True)
                with hm.Group(columns={"fare": hm.mean("fare")}):
                    hm.Text(x=0, y=0, text="fare", format="$.2f")
    parts = title.props["text"]
    assert parts[0] == "Selected: " and parts[2] == " · mean "
    assert parts[1]["format"] == "," and parts[1]["value"].op == "count"
    assert parts[3].op == "mean"
    snapshot, _ = scene._snapshot()
    assert '"$expression"' in json.dumps(snapshot)
    with pytest.raises(ValueError, match="only Title.text shows"):
        hm.Plot(title=f"{hm.count():,}")


def test_consumed_title_markers_cannot_read_a_new_expression(monkeypatch):
    # Consuming the last marker must not free its id for a different live value.
    from hmplot import expressions
    monkeypatch.setattr(expressions, "_LIVE_VALUES", {})
    old = f"{hm.sum('x')}"
    hm.Title(old)
    new = f"{hm.mean('y')}"
    with pytest.raises(ValueError, match="already used"):
        hm.Title(old)
    assert hm.Title(new).props["text"][0].op == "mean"


def test_keyframes_are_expressions_over_the_clock():
    # TODO 136.14b: existing operations only; a list per component; errors name the forms.
    value = hm.keyframes({0: 0, 400: 1}, easing="ease-in-out", time=hm.view.time - hm.row() * 20)
    ops = set()
    def walk(node):
        if isinstance(node, hm.Expression):
            ops.add(node.op)
            for arg in node.args:
                walk(arg)
    walk(value)
    assert ops <= {"add", "subtract", "multiply", "divide", "clip", "cos", "state", "row"}
    assert len(hm.keyframes({0: [0, 0, 5], 1000: [5, 0, 5]}, loop=True)) == 3
    with pytest.raises(ValueError, match="easing is one of"):
        hm.keyframes({0: 0, 1: 1}, easing="bounce")
    with pytest.raises(TypeError, match="at least two stops"):
        hm.keyframes({0: 0})


def test_a_transform_in_a_plot_without_a_table_is_named_where_it_is_built():
    # 2026-10-23: a Calculate inside a Plot with no data= reached the browser, which timed the
    # export out; the scene now refuses it as the with block closes.
    data = {"x": [1.0, 2.0], "y": [1.0, 2.0]}
    with pytest.raises(ValueError, match=r"Calculate has no table to transform"):
        with hm.Scene():
            with hm.Plot():
                with hm.Calculate(columns={"z": hm.col.x * 2}):
                    hm.Points(data=data, x="x", y="y")
    with hm.Scene() as fine:
        with hm.Plot(data=data):
            with hm.Calculate(columns={"z": hm.col.x * 2}):
                hm.Points(x="x", y="z")
        with hm.Data(data):
            with hm.Plot():
                with hm.Filter(where=hm.col.x > 1):
                    hm.Points(x="x", y="y")
    fine._validate()
    chain = hm.Data(data).filter(hm.col.x > 1)
    with hm.Scene() as chained:
        with hm.Plot(data=chain):
            hm.Points(x="x", y="y")
    chained._validate()


def test_an_input_read_with_a_default_resolves_before_its_writers_mount():
    # 2026-10-22: a Treemap's root reads hm.input("root", default="all") and its only writers are
    # the marks inside it, which mount after the layout runs. The read carries its default to the
    # scene, so the static check accepts it and the browser resolves it before any writer.
    root = hm.input("root", default="all")
    edges = {"source": ["all", "all"], "target": ["a", "b"]}
    with hm.Scene() as scene:
        with hm.Plot():
            with hm.GraphData(edges=edges):
                with hm.Treemap(root=root, value="weight", levels=1):
                    with hm.Nodes():
                        hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1", select=root.set("id"))
    treemap = scene._snapshot()[0]["root"]["children"][0]["children"][0]["children"][0]
    assert treemap["props"]["root"] == {"$expression": {"op": "input", "args": ["root"], "default": "all"}}
    # Without a default, nothing declares the input before the marks mount: the check says so.
    with pytest.raises(ValueError, match=r"reads \$root, but no input named 'root'"):
        with hm.Scene():
            with hm.Plot():
                with hm.GraphData(edges=edges):
                    with hm.Treemap(root=hm.input.root, value="weight"):
                        with hm.Nodes():
                            hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1")
    # root is optional: the hierarchy's own root.
    with hm.Plot() as plot:
        with hm.GraphData(edges=edges):
            with hm.Treemap(value="weight"):
                with hm.Nodes():
                    hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1")
    plot._scene()._validate()


def test_an_input_read_makes_its_writes_for_marks_and_buttons():
    # TODO 145.7: root = hm.input("root", default=...) reads the input and makes its writes:
    # root.set("id") on a mark's select, root.set(hm.literal(v)) a constant, root.reset() the
    # default on a mark or a Button's set. Its writers declare it, with no widget of that name.
    root = hm.input("root", default="all")
    assert root.set("id") == {"input": "root", "column": "id", "default": "all"}
    assert root.set(hm.literal("b")) == {"input": "root", "value": "b", "default": "all"}
    assert root.reset() == {"input": "root", "reset": True, "default": "all"}
    assert hm.input.focus.set(hm.col.series) == {"input": "focus", "column": "series"}
    with pytest.raises(TypeError, match=r"takes a column .* or a constant"):
        root.set({})
    data = {"id": ["a", "b"], "x": [1.0, 2.0], "y": [1.0, 2.0]}
    with hm.Scene() as scene:
        hm.Button(label="Top", set=root.reset())
        hm.Button(name="presses", set=[root.set(hm.literal("b"))])
        with hm.Plot(title=root):
            hm.Points(data=data, x="x", y="y", select=root.set("id"))
    button = scene._snapshot()[0]["root"]["children"][0]
    assert button["props"]["set"] == {"input": "root", "reset": True, "default": "all"}
    with pytest.raises(ValueError, match=r"reads a row, which a Button has none of"):
        with hm.Scene():
            hm.Button(label="Bad", set=root.set("id"))
            with hm.Plot(title=root):
                hm.Points(data=data, x="x", y="y")
    with pytest.raises(ValueError, match=r"with set and no name, give it a label"):
        with hm.Scene():
            hm.Button(set=root.reset())
    with pytest.raises(ValueError, match=r"hover cannot reset"):
        with hm.Scene():
            with hm.Plot():
                hm.Points(data=data, x="x", y="y", hover=root.reset())
