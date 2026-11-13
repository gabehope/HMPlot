"""Focused construction checks for the nested-frame foundation."""
import unittest
import hmplot as hm


class FrameConstructionTests(unittest.TestCase):
    def test_nested_frames(self):
        with hm.Plot(data={"x": [0, 1], "y": [0, 1]}) as plot:
            with hm.Data({"x": [1, 2], "y": [3, 4]}):
                with hm.Frame(y={"domain": "auto"}) as frame:
                    with hm.Frame(x={"domain": [0, 2]}) as inner:
                        hm.Points(x="x", y="y")
        self.assertEqual(frame.parent.kind, "Data")
        self.assertIs(inner.parent, frame)
        self.assertEqual(plot.kind, "Plot")

    def test_frame_properties_are_in_generated_signatures(self):
        import json
        from pathlib import Path
        signatures = json.loads((Path(hm.__file__).parent / "signatures.json").read_text())
        self.assertTrue({"x", "y", "z", "scale_defaults", "placement", "coordinates",
                         "projection", "projection_center", "angle_period", "polar_axis",
                         "base_radius"} <= signatures["Frame"].keys())
        self.assertNotIn("pole", signatures["Frame"])
        self.assertNotIn("pole", signatures["Plot"])
        for component in (hm.Plot, hm.Frame):
            with self.assertRaisesRegex(TypeError, "unknown property 'pole'"):
                component(pole="south")

    def test_polar_root_and_nested_spherical_options_serialize(self):
        with hm.Plot(type="2d") as plot:
            with hm.Frame(coordinates="polar", polar_axis="Z", angle_unit="custom",
                          angle_period=24, x={"domain": [0, 24]}, y={"domain": [0, 3]}):
                with hm.Frame(coordinates="spherical", projection="orthographic",
                              projection_center=[0, 0],
                              placement={"anchor": [6, 2], "size": [60, 60]}):
                    hm.Points(position=[[0, 0]])
        snapshot, _buffers = plot._scene()._snapshot()
        polar = snapshot["root"]["children"][0]["children"][0]
        spherical = polar["children"][0]
        self.assertEqual(polar["props"]["anglePeriod"], 24)
        self.assertEqual(polar["props"]["polarAxis"], "Z")
        self.assertEqual(spherical["props"]["placement"]["anchor"], [6, 2])

    def test_promoted_root_coordinate_options_serialize(self):
        with hm.Plot() as plot:
            with hm.Frame(coordinates="spherical", projection="orthographic",
                          projection_center=[6, 0], angle_unit="custom", angle_period=24) as frame:
                hm.Points(position=[[0, 0], [6, 0]])
        self.assertEqual(frame.props["coordinates"], "spherical")
        self.assertEqual(frame.props["projection"], "orthographic")
        self.assertEqual(frame.props["projectionCenter"], [6, 0])
        self.assertEqual(frame.props["anglePeriod"], 24)
        snapshot, _buffers = plot._scene()._snapshot()
        self.assertEqual(snapshot["root"]["children"][0]["children"][0]["props"]["coordinates"], "spherical")

    def test_placement_roundtrip(self):
        with hm.Plot() as plot:
            with hm.Frame(placement={"anchor": [35, 65], "size": [160, 100], "rotation": [0, 0, 20]}) as frame:
                hm.Points(position=[[0, 0], [1, 1]])
        self.assertEqual(frame.props["placement"]["size"], [160, 100])

    def test_embedded_facets_keep_one_plot(self):
        with hm.Plot(data={"group": ["A", "B"], "value": [1, 2]}) as plot:
            with hm.Facet(column="group", layout="bands", band_padding=.2) as facet:
                hm.Points(x="value", y="value")
        self.assertIs(facet.parent, plot)
        self.assertEqual(facet.props["bandPadding"], .2)
        self.assertEqual(facet.children[0].kind, "Points")
        plot._scene()._snapshot()


def test_events_report_their_enclosing_frame():
    with hm.Scene() as scene:
        with hm.Plot() as plot:
            with hm.Frame(placement={"anchor": [0.5, 0.5], "size": [100, 80]}) as frame:
                inside = hm.Points(position=[[0, 0]])
            outside = hm.Points(position=[[1, 1]])
    scene._views["v"] = {"ready": True}
    seen = {}
    inside.on_click(lambda event: seen.setdefault("inside", event.frame))
    outside.on_click(lambda event: seen.setdefault("outside", event.frame))
    for node in (inside, outside):
        scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision,
                        "target": node.id, "event": "click", "payload": {"source_index": 0}}, [])
    assert seen["inside"] is frame
    assert seen["outside"] is plot


def test_promoted_root_event_uses_the_explicit_frame_node():
    with hm.Plot(data={"x": [1.0], "y": [2.0]}) as plot:
        with hm.Data({"x": [1.0], "y": [2.0]}):
            with hm.Frame(x={"domain": [0, 3]}, y={"domain": [0, 3]}) as root:
                point = hm.Points(x="x", y="y")
    scene = plot._scene()
    scene._views["v"] = {"ready": True}
    seen = []
    point.on_click(seen.append)
    scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision,
                    "target": point.id, "event": "click", "payload": {"source_index": 0}}, [])
    assert seen[0].frame is root


def test_facet_cell_events_report_the_node_enclosing_the_facet_and_the_cell():
    # Facet cells exist only in the browser, so event.frame is the Plot around the Facet
    # and event.facet_cell tells the cells apart.
    with hm.Scene() as scene:
        with hm.Plot(data={"g": ["a", "b"], "x": [1.0, 2.0], "y": [1.0, 2.0]}) as plot:
            with hm.Facet(column="g"):
                points = hm.Points(x="x", y="y")
    scene._views["v"] = {"ready": True}
    seen = []
    points.on_click(seen.append)
    for cell in ("g=a", "g=b"):
        scene._receive({"type": "event", "scene": scene.id, "view": "v", "revision": scene.revision,
                        "target": points.id, "event": "click",
                        "payload": {"source_index": 0, "facet_cell": cell}}, [])
    assert [event.frame for event in seen] == [plot, plot]
    assert [event.facet_cell for event in seen] == ["g=a", "g=b"]


def test_placement_snapshot_is_versioned():
    import pytest
    placement = {"anchor": [0, 0], "size": [10, 10]}
    with hm.Scene():
        with hm.Plot():
            with hm.Frame(placement=placement) as frame:
                hm.Points(position=[[0, 0]])
    assert frame.props["placement"]["version"] == 1
    assert "version" not in placement  # the caller's dict is not mutated
    for version, shown in ((2, "2"), (0, "0"), ("1", "'1'"), (None, "None"), (True, "True")):
        with pytest.raises(ValueError) as error:
            hm.Frame(placement={"version": version, "anchor": [0, 0], "size": [10, 10]})
        assert str(error.value) == f"Frame: unsupported placement version {shown}; expected 1."


def test_empty_and_none_labels_mean_automatic_titles():
    # Axis titles default to the plotted column (TODO 21): "" and None are "automatic" and travel
    # unchanged in the snapshot; the browser derives the title and never sends it back as an edit.
    with hm.Plot(x={"label": ""}, data={"a": [1.0, 2.0], "b": [3.0, 4.0]}) as plot:
        with hm.Frame(x={"label": ""}, y={"label": None}) as frame:
            hm.Points(x="a", y="b")
    assert plot.props["x"] == {"label": ""}
    snapshot, _buffers = plot._scene()._snapshot()
    root = snapshot["root"]["children"][0]
    assert root["props"]["x"] == {"label": ""}

    def find(node):
        if node["id"] == frame.id:
            return node
        return next((found for child in node.get("children", []) if (found := find(child))), None)

    frame_node = find(root)
    assert frame_node["props"]["x"] == {"label": ""}
    assert frame_node["props"]["y"] == {"label": None}


def test_axis_style_frame_mask_and_3d_guides_round_trip():
    axis = {"line": False, "ticks": True, "tick_size": 6, "tick_direction": "both",
            "title_font_weight": 650, "grid_color": "#ccc", "grid_width": .5, "grid_dash": [3, 2]}
    with hm.Plot(x=axis, axis_frame=True, axis_mask=True) as plot:
        with hm.Frame(axis_frame=False, axis_mask=False, y=axis) as frame:
            hm.Points(x=[1, 2], y=[2, 1])
    assert plot.props["x"]["tickDirection"] == "both"
    assert plot.props["x"]["gridDash"] == [3, 2]
    assert plot.props["axisFrame"] is True and frame.props["axisMask"] is False
    plot = hm.Plot(type="3d", aspect="equal", axes3d={"style": "triad", "grid_planes": ["xy", "xz"]})
    assert plot.props["axes3d"] == {"style": "triad", "gridPlanes": ["xy", "xz"]}
    plot.update(type="2d")  # The guide configuration remains available on a mode change.
    assert plot.props["axes3d"]["style"] == "triad"


def test_axis_style_values_reject_invalid_inputs_before_rendering():
    import pytest
    for axis in ({"line": "off"}, {"ticks": 1}, {"tick_size": -1}, {"tick_direction": "in"},
                 {"title_font_weight": "bold"}, {"title_font_weight": 1001}, {"grid_color": []},
                 {"grid_width": float("inf")}, {"grid_dash": [1, -1]}):
        with pytest.raises(ValueError, match="Plot.x"):
            hm.Plot(x=axis)
    for config in ("box", {"style": "cube"}, {"grid_planes": "xy"}, {"grid_planes": ["xx"]}):
        with pytest.raises(ValueError, match="Plot.axes3d"):
            hm.Plot(axes3d=config)
    with pytest.raises(ValueError, match="Plot.axis_mask"):
        hm.Plot(axis_mask="yes")
    with pytest.raises(ValueError, match="Frame.axis_frame"):
        hm.Frame(axis_frame=1)


def test_explicit_frame_masks_and_guide_styles_require_compatible_coordinates():
    import pytest
    for options in ({"coordinates": "polar"}, {"coordinates": "spherical", "projection": "mercator"}, {"type": "3d"}):
        with pytest.raises(ValueError, match="axis_mask.*2D Cartesian"):
            with hm.Scene():
                hm.Plot(**options, axis_mask=True)
    with pytest.raises(ValueError, match="Frame.axis_mask.*2D Cartesian"):
        with hm.Plot(coordinates="spherical", projection="mercator"):
            with hm.Frame(axis_mask=True):
                pass
    with pytest.raises(ValueError, match="axes3d.*Cartesian"):
        with hm.Scene():
            hm.Plot(coordinates="spherical", type="3d", axes3d={"style": "box"})
    plot = hm.Plot(axis_mask=True)
    with pytest.raises(ValueError, match="axis_mask.*2D Cartesian"):
        plot.update(type="3d")
    assert plot.props.get("type", "2d") == "2d"  # Failed updates remain transactional.


def test_placed_cartesian_mask_stops_at_its_rectangular_surface():
    import pytest
    for parent in ("polar", "spherical"):
        with hm.Plot(coordinates=parent, projection="mercator") as plot:
            with hm.Frame(coordinates="cartesian", placement={"anchor": [0, 1], "size": [100, 80]},
                          axis_mask=True, axis_frame=True):
                with hm.Frame(axis_mask=True):
                    hm.Points(x=[0, 1], y=[0, 1])
        plot._scene()._validate()
        # A placement without a Cartesian coordinate override still inherits the curved frame.
        with pytest.raises(ValueError, match="Frame.axis_mask.*2D Cartesian"):
            with hm.Scene():
                with hm.Plot(coordinates=parent, projection="mercator"):
                    hm.Frame(placement={"anchor": [0, 1], "size": [100, 80]}, axis_mask=True)
