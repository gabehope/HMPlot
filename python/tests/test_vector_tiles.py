# TODO 24: hm.VectorTile, fixed vector tiles loaded in the browser and drawn as a basemap.
import pytest

import hmplot as hm

URL = "https://tiles.example.org/{z}/{x}/{y}.pbf"


def node(state, kind):
    found = []

    def visit(n):
        if n["kind"] == kind:
            found.append(n)
        for child in n["children"]:
            visit(child)

    visit(state["root"])
    return found


def test_a_vector_tile_takes_tile_coordinates_styles_and_source_layers():
    with hm.Scene() as scene:
        with hm.Plot(coordinates="spherical", projection="mercator", tone_mapping=0):
            tiles = hm.VectorTile(url=URL, tile=(14, 4824, 6159), styles={"buildings": False, "water": {"fill": "#9cc"}},
                                  source_layers={"parcels": "buildings"}, fit=False)
            hm.Points(data={"lon": [-73.99], "lat": [40.72]}, x="lon", y="lat")
    state, _ = scene._snapshot()
    [props] = [n["props"] for n in node(state, "VectorTile")]
    assert props == {"url": URL, "tile": [14, 4824, 6159], "styles": {"buildings": False, "water": {"fill": "#9cc"}},
                     "sourceLayers": {"parcels": "buildings"}, "fit": False}
    tiles.update(bounds=(-74.01, 40.70, -73.97, 40.73), zoom=14, tile=None)
    state, _ = scene._snapshot()
    assert node(state, "VectorTile")[0]["props"]["bounds"] == [-74.01, 40.70, -73.97, 40.73]
    with pytest.raises(TypeError):
        hm.VectorTile(url=URL, tile_size=512)


def test_a_vector_tile_in_a_local_plane_on_the_ground():
    with hm.Scene() as scene:
        with hm.Plot(type="3d"):
            hm.VectorTile(url=URL, bounds=(-74.068, 40.669, -73.885, 40.895), zoom=12,
                          origin=(-73.95, 40.72), units_per_meter=0.004, plane="xz")
    state, _ = scene._snapshot()
    props = node(state, "VectorTile")[0]["props"]
    assert (props["origin"], props["unitsPerMeter"], props["plane"]) == ([-73.95, 40.72], 0.004, "xz")


def test_a_flyover_streams_tiles_with_extruded_buildings_and_momentum():
    # TODO 66: under a flyover camera live tiles follow it and their buildings stand; both are on
    # by default, and the keywords turn them off.
    with hm.Scene() as scene:
        with hm.Plot(type="3d", camera_mode="flyover", flyover_momentum=False) as plot:
            tiles = hm.VectorTile(tile=(14, 8414, 5384), origin=(4.88, 52.37), units_per_meter=0.01, plane="xz",
                                  extrude_buildings=False)
    state, _ = scene._snapshot()
    assert node(state, "Plot")[0]["props"]["flyoverMomentum"] is False
    assert node(state, "VectorTile")[0]["props"]["extrudeBuildings"] is False
    tiles.update(extrude_buildings=True)
    plot.update(flyover_momentum=True)
    state, _ = scene._snapshot()
    assert node(state, "VectorTile")[0]["props"]["extrudeBuildings"] is True
    assert node(state, "Plot")[0]["props"]["flyoverMomentum"] is True
    with pytest.raises(TypeError):
        hm.VectorTile(tile=(14, 8414, 5384), extrude=True)


def test_a_vector_tile_shown_alone_is_a_mercator_basemap():
    tiles = hm.VectorTile(url=URL, tile=(13, 2411, 3080))
    scene = tiles._scene()
    [plot] = scene.children
    assert plot.kind == "Plot"
    assert plot.props == {"height": 480, "coordinates": "spherical", "projection": "mercator", "toneMapping": 0}
    assert plot.children == [tiles]


def test_decoded_data_stays_geojson_and_loads_nothing():
    square = {"type": "Feature", "properties": {"layerName": "water_polygons"},
              "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}}
    with hm.Scene() as scene:
        with hm.Plot(coordinates="spherical", projection="mercator"):
            hm.VectorTile(data={"type": "FeatureCollection", "features": [square]}, tiles=[(14, 8192, 8191)])
    state, columns = scene._snapshot()
    props = node(state, "VectorTile")[0]["props"]
    # As GeoJSON's data: a structured geometry resource the renderer reads back as GeoJSON.
    resource = columns[props["data"]["$column"]]
    assert state["columns"][resource.id]["dtype"] == "geojson"
    assert resource.structured["features"][0]["properties"] == {"layerName": "water_polygons"}
    assert props["tiles"] == [[14, 8192, 8191]]
    assert state["tables"] == {}


def test_browserless_html_export_keeps_vector_tiles_live_and_says_so():
    with hm.Scene() as scene:
        with hm.Plot(coordinates="spherical", projection="mercator"):
            live = hm.VectorTile(url=URL, tile=(13, 2411, 3080))
            hm.VectorTile(url=URL, tile=(13, 2412, 3080), snapshot=False)
    with pytest.warns(RuntimeWarning, match=f"VectorTile {live.id} will load when the page opens"):
        html = hm.export_html(scene, snapshot=False).decode("utf-8")
    assert URL in html
    with hm.ExportSession() as session:
        with pytest.warns(RuntimeWarning):
            session.html(scene, snapshot=False)
        assert session.last_report["live_tiles"] == [live.id]
        assert session.last_report["live_providers"] == []


def test_live_tiles_zooms_attribution_and_embedded_tile_data():
    # TODO 35: live mode's keywords, and tiles embedded as raw bytes load nothing: a browserless
    # export does not warn about them.
    embedded = [{"tile": [13, 2411, 3080], "bytes": "GgA="}]
    with hm.Scene() as scene:
        with hm.Plot(coordinates="spherical", projection="mercator"):
            tiles = hm.VectorTile(url=URL, tile=(13, 2411, 3080), live=True, min_zoom=2, max_zoom=12,
                                  attribution="© OpenStreetMap contributors", tile_data=embedded)
    state, _ = scene._snapshot()
    props = node(state, "VectorTile")[0]["props"]
    assert (props["live"], props["minZoom"], props["maxZoom"]) == (True, 2, 12)
    assert props["attribution"] == "© OpenStreetMap contributors"
    assert props["tileData"] == embedded
    tiles.update(live=False)
    assert node(scene._snapshot()[0], "VectorTile")[0]["props"]["live"] is False
    with hm.ExportSession() as session:
        session.html(scene, snapshot=False)
        assert session.last_report["live_tiles"] == []
