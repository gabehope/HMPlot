# TODO 36: themes inherit with `extends`, and carry a vectorTile scheme.
import json

import pytest

import hmplot as hm


def test_a_theme_extends_a_preset_by_any_spelling_of_its_name():
    for name in ("finance-terminal", "finance_terminal", "financeTerminal"):
        mine = hm.create_theme(extends=name, palette=["#00ff88"])
        assert mine.value["name"] == "Finance terminal"
        assert mine.value["palette"] == ["#00ff88"]
        assert mine.value["view"] == hm.themes.get("finance-terminal")["view"]
        assert "extends" not in mine.value
    with pytest.raises(ValueError, match='unknown preset "nope"'):
        hm.create_theme(extends="nope")


def test_a_theme_extends_another_theme_and_replace_rebases_it():
    base = hm.create_theme("Base", extends="dark", axes={"grid": "major"})
    child = hm.create_theme("Child", extends=base, vector_tile={"major_roads": {"color": "#ff0000"}})
    assert child.value["name"] == "Child"
    assert child.value["axes"]["grid"] == "major"
    assert child.value["vectorTile"]["majorRoads"] == {"color": "#ff0000", "width": hm.themes.dark["vectorTile"]["majorRoads"]["width"]}
    assert child.value["vectorTile"]["water"] == hm.themes.dark["vectorTile"]["water"]
    with pytest.raises(ValueError, match="cannot change extends"):
        child.update(extends="sea")
    assert child.replace({"extends": "sea"}).value["name"] == "Sea"


def test_load_theme_resolves_extends_and_checks_the_vector_tile_section(tmp_path):
    path = tmp_path / "theme.json"
    path.write_text(json.dumps({"extends": "dark", "name": "Night", "vectorTile": {"water": {"fill": "#102030"}}}))
    night = hm.load_theme(path)
    assert night.value["vectorTile"]["water"] == {"fill": "#102030"}
    assert night.value["view"] == hm.themes.dark["view"]
    path.write_text(json.dumps({"vectorTile": {"lakes": {}}}))
    with pytest.raises(ValueError, match='no part "lakes"'):
        hm.load_theme(path)
    # TODO 132.2: the legends' section, checked as the browser checks it.
    path.write_text(json.dumps({"guides": {"position": "top", "layout": "stacked", "swatchSize": 14}}))
    assert hm.load_theme(path).value["guides"]["position"] == "top"
    for guides, message in (({"position": "center"}, "theme.guides.position"), ({"swatchShape": "star"}, "theme.guides.swatchShape"),
                            ({"titleFontWeight": 50}, "theme.guides.titleFontWeight"), ({"swatchSize": 0}, "theme.guides.swatchSize")):
        path.write_text(json.dumps({"guides": guides}))
        with pytest.raises(ValueError, match=message):
            hm.load_theme(path)
    # TODO 132.5: "inherit" takes the host page's font and text color, resolved in the browser.
    path.write_text(json.dumps({"typography": {"fontFamily": "inherit", "color": "inherit"}}))
    assert hm.load_theme(path).value["typography"] == {"fontFamily": "inherit", "color": "inherit"}
    # TODO 132.1: the title block's section, checked as the browser checks it.
    path.write_text(json.dumps({"title": {"align": "center", "fontSize": 22, "fontWeight": 700}}))
    assert hm.load_theme(path).value["title"]["align"] == "center"
    for title, message in (({"align": "middle"}, "theme.title.align"), ({"fontWeight": 950}, "theme.title.fontWeight"),
                           ({"colour": "red"}, "theme.title.colour")):
        path.write_text(json.dumps({"title": title}))
        with pytest.raises(ValueError, match=message):
            hm.load_theme(path)
    # TODO 132.4: numbers.format, a d3-format string.
    path.write_text(json.dumps({"numbers": {"format": "$,.0f"}}))
    assert hm.load_theme(path).value["numbers"] == {"format": "$,.0f"}
    for numbers, message in (({"format": "%Y"}, "theme.numbers.format"), ({"format": None}, "theme.numbers.format"),
                             ({"format": ",.2f\n"}, "theme.numbers.format"), ({"currency": "EUR"}, "theme.numbers.currency")):
        path.write_text(json.dumps({"numbers": numbers}))
        with pytest.raises(ValueError, match=message):
            hm.load_theme(path)
    # TODO 132.3: the inputs' accent and text size.
    path.write_text(json.dumps({"controls": {"accentColor": "#0f766e", "fontSize": 13}}))
    assert hm.load_theme(path).value["controls"] == {"accentColor": "#0f766e", "fontSize": 13}
    for controls, message in (({"accentColor": ""}, "theme.controls.accentColor"), ({"fontSize": 0}, "theme.controls.fontSize"),
                              ({"height": 30}, "theme.controls.height")):
        path.write_text(json.dumps({"controls": controls}))
        with pytest.raises(ValueError, match=message):
            hm.load_theme(path)


def test_every_preset_has_a_vector_tile_scheme():
    parts = {"background", "land", "green", "water", "waterways", "buildings", "other",
             "paths", "roads", "majorRoads", "railways", "boundaries", "places"}
    for name in hm.themes.names():
        assert set(hm.themes.get(name)["vectorTile"]) == parts, name


def test_a_vector_tile_takes_a_scheme():
    with hm.Scene() as scene:
        with hm.Plot(coordinates="spherical", projection="mercator"):
            hm.VectorTile(url="/t/{z}/{x}/{y}.pbf", tile=(1, 0, 0), scheme="sea")
    state, _ = scene._snapshot()
    [node] = [child for child in state["root"]["children"][0]["children"] if child["kind"] == "VectorTile"]
    assert node["props"]["scheme"] == "sea"


def test_axis_positioning_in_themes_round_trips_python_names():
    theme = hm.create_theme(axes={"arrow": "end", "arrow_size": 5, "title_position": "middle", "title_angle": "auto",
                                  "title_placement": "outside", "title_offset": 10,
                                  "tick_label_angle": 30, "tick_label_align": "end",
                                  "tick_label_placement": "outside", "tick_label_offset": 5})
    assert theme.value["axes"]["titlePosition"] == "middle"
    assert theme.value["axes"]["arrowSize"] == 5
    assert theme.value["axes"]["tickLabelAngle"] == 30
    for name in hm.themes.names():
        axes = hm.themes.get(name)["axes"]
        assert axes["titlePlacement"] == "outside"
        assert axes["fontSize"] >= (12 if name == "notebook" else 13 if name == "observable" else 14)


def test_axis_style_theme_settings_are_checked_on_create_update_replace_and_load(tmp_path):
    axes = {"line": False, "ticks": True, "tick_size": 4, "tick_direction": "both",
            "title_font_weight": 600, "grid_color": "#ddd", "grid_width": .5, "grid_dash": [3, 2],
            "frame": True, "mask": True, "three_d": {"style": "triad", "grid_planes": ["xy", "yz"]}}
    theme = hm.create_theme(axes=axes)
    assert theme.value["axes"]["threeD"] == {"style": "triad", "gridPlanes": ["xy", "yz"]}
    assert theme.value["axes"]["tickDirection"] == "both"
    version = theme.version
    for patch in ({"line": 0}, {"ticks": "yes"}, {"tick_size": -1}, {"tick_direction": "in"},
                  {"title_font_weight": 1001}, {"grid_width": float("nan")}, {"grid_color": 2},
                  {"grid_dash": [2, -1]}, {"frame": "yes"}, {"mask": 1},
                  {"three_d": {"style": "sphere"}}, {"three_d": {"grid_planes": ["xx"]}}):
        for mutate in (lambda: hm.create_theme(axes=patch), lambda: theme.update(axes=patch),
                       lambda: theme.replace({"axes": patch})):
            with pytest.raises(ValueError, match="theme.axes"):
                mutate()
        assert theme.version == version and theme.value["axes"]["line"] is False
    path = tmp_path / "axis-theme.json"
    path.write_text(json.dumps({"axes": theme.value["axes"]}))
    assert hm.load_theme(path).value["axes"] == theme.value["axes"]
    path.write_text(json.dumps({"axes": {"threeD": {"gridPlanes": ["xx"]}}}))
    with pytest.raises(ValueError, match="grid_planes"):
        hm.load_theme(path)


def test_hmplot_minimal_and_ink_are_distinct_fresh_theme_presets():
    standard, minimal, ink = hm.themes.hmplot, hm.themes.minimal, hm.themes.ink
    assert standard["view"]["background"] == "#ffffff"
    assert standard["axes"]["titlePlacement"] == "outside"
    assert standard["axes"]["mask"] is True
    assert minimal["axes"]["line"] is False and minimal["axes"]["mask"] is False
    assert minimal["axes"]["arrow"] == "none" and minimal["axes"]["titlePlacement"] == "outside"
    assert ink["palette"] != standard["palette"]
    for preset in (standard, ink):
        assert "Ribbon" not in preset["marks"]
        assert preset["marks"]["Area"]["opacity"] == 1
        assert preset["marks"]["Line"]["color"] is None
        assert preset["marks"]["Points"]["fill"] is None
    custom = hm.create_theme(extends="hmplot", palette=["#ff0000"])
    custom.update(palette=["#0000ff"])
    assert custom.value["marks"]["Line"]["color"] is None
    custom.update(marks={"Line": {"color": "purple"}})
    assert custom.value["marks"]["Line"]["color"] == "purple"
    original = hm.themes.ink["palette"][0]
    ink["palette"][0] = "pink"
    assert hm.themes.ink["palette"][0] == original
    for name in hm.themes.names():
        axes = hm.themes.get(name)["axes"]
        assert axes["threeD"] == {"style": "box", "gridPlanes": []}
        assert axes["frame"] is (name in ("journal", "graph", "blueprint"))
        if axes["frame"]:
            assert axes["arrow"] == "none"


# TODO 132.7: `extends` as a list, merged left to right under the theme's own keys; partial themes.
def test_extends_takes_a_list_of_presets_partials_and_definitions():
    mine = hm.create_theme("Mine", extends=["paper", "axes/minimal", {"palette": ["#111111"], "axes": {"tick_size": 5}}, "legend/inline_top"],
                           guides={"layout": "stacked"})
    paper = hm.themes.paper
    assert mine.value["name"] == "Mine"
    assert mine.value["view"] == paper["view"]
    assert mine.value["axes"]["grid"] == "off" and mine.value["axes"]["tickSize"] == 5
    assert mine.value["axes"]["color"] == paper["axes"]["color"]
    assert mine.value["palette"] == ["#111111"]
    assert (mine.value["guides"]["position"], mine.value["guides"]["layout"]) == ("top", "stacked")
    assert hm.create_theme(extends=["paper", "title/centered"]).value["name"] == "Paper"
    with pytest.raises(ValueError, match='unknown partial theme "axes/nope"'):
        hm.create_theme(extends=["paper", "axes/nope"])


def test_a_partial_theme_that_sets_keys_outside_its_section_warns(tmp_path):
    with pytest.warns(UserWarning, match=r'"axes/house" sets theme.palette, outside its section \(theme.axes\)') as caught:
        hm.create_theme(extends=["hmplot", {"name": "axes/house", "axes": {"grid": "major"}, "palette": ["#ff0000"]}])
    assert caught[0].filename == __file__, "the warning points at the caller"
    path = tmp_path / "theme.json"
    path.write_text(json.dumps({"extends": ["dark", "numbers/currency"], "name": "Money"}))
    assert hm.load_theme(path).value["numbers"] == {"format": "$,.0f"}


def test_a_partial_lends_only_its_section_through_its_own_extends_and_resources():
    import warnings
    house = {"name": "axes/house", "extends": "paper", "axes": {"grid": "major"}}
    theme = hm.create_theme(extends=["dark", house]).value
    dark, paper = hm.themes.dark, hm.themes.paper
    assert (theme["name"], theme["view"], theme["palette"]) == (dark["name"], dark["view"], dark["palette"])
    assert (theme["axes"]["grid"], theme["axes"]["color"]) == ("major", paper["axes"]["color"])
    night = hm.create_theme(extends="dark", palette=["#123456"])
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        legend = hm.create_theme("legend/house", guides={"position": "left"})
        partial = hm.create_theme(extends=[hm.create_theme(**{**house, "name": "axes/house"})])
    assert set(partial.value) == {"axes"}
    listed = hm.create_theme(extends=["paper", night, legend]).value
    assert (listed["name"], listed["palette"], listed["view"], listed["guides"]["position"]) == (dark["name"], ["#123456"], dark["view"], "left")
    with pytest.raises(ValueError, match="unknown partial theme"):
        hm.create_theme(extends=["axes/minimal/typo"])



def test_theme_animation_and_its_partials(tmp_path):
    path = tmp_path / "theme.json"
    path.write_text(json.dumps({"extends": ["hmplot", "animation/fast", "animation/fade"], "animation": {"easing": "linear"}}))
    assert hm.load_theme(path).value["animation"] == {"duration": 150, "easing": "linear", "enter": "fade", "exit": "fade"}
    for animation, message in (({"duration": -1}, "animation.duration must be a nonnegative"), ({"easing": "bounce"}, "animation.easing must be one of"),
                               ({"enter": "slide"}, "animation.enter must be True"), ({"exit": {"effect": "slide"}}, 'animation.exit.effect must be "fade"'),
                               ({"delay": 10}, "theme.animation.delay"), ({"enter": None}, "animation.enter must be True")):
        path.write_text(json.dumps({"animation": animation}))
        with pytest.raises(ValueError, match=message):
            hm.load_theme(path)


def test_mark_partials_compose_without_resetting_unrelated_sections(tmp_path):
    theme = hm.create_theme(extends=["paper", "marks/points_dense", "marks/lines_fine", "marks/points_open"])
    assert theme.value["name"] == "Paper"
    assert theme.value["palette"] == hm.themes.paper["palette"]
    assert theme.value["marks"]["ErrorBars"] == hm.themes.paper["marks"]["ErrorBars"]
    assert theme.value["marks"]["Points"]["fill"] == "transparent"
    assert theme.value["marks"]["Points"]["opacity"] == 1
    assert theme.value["marks"]["Line"]["width"] == 1
    own = hm.create_theme(extends=["paper", "marks/points_dense"], marks={"Points":{"size":13}})
    assert own.value["marks"]["Points"]["size"] == 13
    muted = hm.create_theme(extends=["paper", "marks/bars-muted"])
    assert muted.value["marks"]["Bar"]["opacity"] == .65
    assert "Histogram" not in muted.value["marks"]
    invalid = tmp_path / "invalid-theme.json"
    invalid.write_text('{"marks":{"Bar":{"bandFraction":0.6}}}')
    with pytest.raises(ValueError, match="Unsupported theme property"):
        hm.load_theme(invalid)


@pytest.fixture(scope="module")
def style_exports():
    from hmplot.exporter import ExportSession
    with ExportSession() as session:
        yield session


@pytest.mark.parametrize("recipe,title", [
    ("27_centered_report", "Quarterly observations"),
    ("28_dense_scatter", "Station observations"),
    ("29_band_reference", "Estimate and supplied interval"),
    ("30_annotated_chart", "A notable observation"),
    ("31_compact_colorbar", "Correlation matrix"),
])
def test_style_recipes_draw_and_export(style_exports, recipe, title):
    import runpy
    from pathlib import Path
    import xml.etree.ElementTree as ET
    root = Path(__file__).resolve().parents[2]
    chart = runpy.run_path(str(root / "src" / "recipes" / f"{recipe}.py"))["chart"]
    svg = style_exports.svg(chart, mode="auto" if recipe == "31_compact_colorbar" else "vector")
    doc = ET.fromstring(svg)
    assert title in "".join(doc.itertext())
    assert style_exports.png(chart, scale=2).startswith(b"\x89PNG")
    if recipe == "27_centered_report":
        assert len(doc.findall(".//{http://www.w3.org/2000/svg}circle")) >= 4
        assert style_exports.pdf(chart).startswith(b"%PDF")
        assert b"hmplot-state" in style_exports.html(chart)
    elif recipe == "29_band_reference":
        assert 'stroke-dasharray="5 3"' in svg.decode()
    elif recipe == "30_annotated_chart":
        assert "Observed response" in "".join(doc.itertext())
    elif recipe == "31_compact_colorbar":
        assert "Correlation" in "".join(doc.itertext())


@pytest.mark.parametrize("preset", ["paper", "dark"])
def test_mark_partial_standalone_is_live_offline_and_keeps_explicit_overrides(style_exports, tmp_path, preset):
    import base64
    with hm.Theme(value={"extends":[preset,"marks/points-open"]}) as scene:
        with hm.Plot(data={"x":[0.,1.],"y":[0.,1.]}, width=380, height=300,
                     title="Open symbols", x={"domain":[-1,2]}, y={"domain":[-1,3]}) as plot:
            hm.Points(x="x", y="y")
            hm.Points(x="x", y=2, size=12, fill="#c0262e")
    path=tmp_path / f"{preset}.html"
    style_exports.html(scene,path)
    page=style_exports.browser.new_page()
    try:
        page.call("Emulation.setDeviceMetricsOverride",{"width":700,"height":600,"deviceScaleFactor":2,"mobile":False})
        page.goto(path.as_uri())
        page.wait_for("!document.getElementById('hmplot-snapshot') && [...document.querySelectorAll('.canvas')].every(e=>e.getAttribute('aria-busy')==='false')")
        result=page.evaluate("async id => hmplotExport('export_svg',id,{mode:'vector'})",plot.id)
        svg=base64.b64decode(result["payload"]).decode()
        assert 'fill="transparent"' in svg and 'stroke="#64748b"' in svg
        assert 'fill="#c0262e"' in svg
        assert page.evaluate("() => devicePixelRatio") == 2
    finally:
        page.close()
