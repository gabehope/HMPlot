"""Plugins from Python (TODO 138.4): a plugin package (tests/plugins/hmplot_test_hatch, the docs'
hatch) installed in the environment, hm.use_plugin, its parameters checked from the manifest, its
name in scene states and templates, and its file in exported pages, checked by its hash."""
import json
import shutil
import sys
import warnings
from pathlib import Path

import pytest

import hmplot as hm
from hmplot import chrome, exporter, plugins

PACKAGE = Path(__file__).parent / "plugins"
DATA = {"x": [1.0, 2.0, 3.0], "y": [2.0, 1.0, 3.0]}


def install(root, package_root=PACKAGE, monkeypatch=None, name="test-hatch", module="hmplot_test_hatch"):
    """Install a plugin package as pip does: its distribution's metadata (with the entry point) on
    sys.path, and the package importable."""
    info = root / f"{module}-0.1.0.dist-info"
    info.mkdir(parents=True)
    (info / "METADATA").write_text(f"Metadata-Version: 2.1\nName: {module.replace('_', '-')}\nVersion: 0.1.0\n")
    (info / "entry_points.txt").write_text(f"[hmplot.plugins]\n{name} = {module}\n")
    monkeypatch.syspath_prepend(str(root))
    monkeypatch.syspath_prepend(str(package_root))
    monkeypatch.delitem(sys.modules, module, raising=False)


@pytest.fixture
def hatch(tmp_path, monkeypatch):
    install(tmp_path / "site", monkeypatch=monkeypatch)
    yield
    plugins._USED.clear()


def shaded_plot(**shade):
    with hm.Plot(data=DATA, width=300, height=200) as plot:
        hm.Points(x="x", y="y", size=40, shade=hm.shade("hatch", **shade))
    return plot


def test_use_plugin_reads_the_manifest_and_checks_parameters_from_it(hatch):
    plugin = hm.use_plugin("test-hatch")
    manifest = json.loads((PACKAGE / "hmplot_test_hatch" / "manifest.json").read_text())
    assert (plugin.name, plugin.version, plugin.hash) == ("test-hatch", "0.1.0", manifest["hash"])
    assert list(plugin.hooks["shade"]) == ["hatch"]
    assert plugin.source() == (PACKAGE / "hmplot_test_hatch" / "hatch.js").read_bytes()
    # Parameters are checked as the browser checks them, naming the mark.
    with pytest.raises(ValueError, match=r"^Points\.shade: hatch spacing is a number of at least 2; got 1\.$"):
        shaded_plot(spacing=1)
    with pytest.raises(ValueError, match=r"Points\.shade: hatch \"gap\" is not one of its parameters \(spacing, width, ink\)"):
        shaded_plot(gap=3)
    # A scene naming its shade names the plugin in its state: names, never code.
    state, _ = shaded_plot(spacing=6)._scene()._snapshot()
    assert state["plugins"] == [plugin.ref] == [{"name": "test-hatch", "version": "0.1.0", "hash": manifest["hash"]}]
    with hm.Plot(data=DATA) as plain:
        hm.Points(x="x", y="y")
    assert "plugins" not in plain._scene()._snapshot()[0]


def test_parameter_checks_match_the_browser():
    # An expression only for an expression parameter; a select's True is not 1 (strict, as JS).
    assert plugins._value_problem("spacing", {"type": "number"}, hm.input.spacing).startswith("spacing is a number")
    assert plugins._value_problem("count", {"type": "expression"}, hm.input.count) == ""
    assert plugins._value_problem("mode", {"type": "select", "options": [0, 1]}, True) == "mode is one of 0, 1; got true."
    assert plugins._value_problem("mode", {"type": "select", "options": [0, 1]}, 1) == ""
    assert plugins._value_problem("extent", {"type": "vector", "shape": [2, 2]}, [[0, 0], [1, 1]]) == ""
    assert "shape" in plugins._value_problem("extent", {"type": "vector", "shape": [2, 2]}, [0, 0, 1, 1])
    # A vector is a list of its length's numbers (TODO 138.5).
    assert plugins._value_problem("turn", {"type": "vector", "length": 3}, (0, 90, 0)) == ""
    assert plugins._value_problem("turn", {"type": "vector", "length": 3}, [0, 90]) == "turn is a list of 3 numbers; got [0, 90]."
    # A plugin cannot name a built-in effect; its file is UTF-8 without a byte order mark.
    manifest = {"name": "acme", "version": "1", "main": "a.js", "hash": "sha256-x", "apiVersion": 1,
                "hooks": {"effect": {"fog": {"parameters": {}}}}}
    assert "is the name of a built-in effect" in plugins._manifest_problem("acme", manifest)
    layout_schema = {"gap": {"type": "number", "default": 2}}
    layout_manifest = {**manifest, "hooks": {"layout": {"acme.tree": {"parameters": layout_schema}}}}
    assert plugins._manifest_problem("acme", layout_manifest) == ""
    assert plugins.Plugin(layout_manifest, None).hooks["layout"]["acme.tree"]["parameters"] == layout_schema
    shared = {**layout_manifest, "hooks": {"transform": {"acme.tree": {}}, "layout": {"acme.tree": {}}}}
    assert 'both declare "acme.tree"' in plugins._manifest_problem("acme", shared)
    reserved = {**layout_manifest, "hooks": {"transform": {"acme.bad": {"parameters": {"by": {"type": "field"}}}}}}
    assert '"by" is reserved by Transform' in plugins._manifest_problem("acme", reserved)

    class File:
        def __init__(self, data):
            self.data = data

        def read_bytes(self):
            return self.data

    for data, message in ((b"\xef\xbb\xbfexport default {}", "byte order mark"), (b"\xff", "not UTF-8 text")):
        manifest["hooks"] = {}
        with pytest.raises(plugins.PluginError, match=message):
            plugins.Plugin({**manifest, "hash": plugins.file_hash(data)}, File(data)).source()


def test_a_plugin_s_image_parameter_goes_as_a_file_and_a_vector_as_a_list(monkeypatch, tmp_path):
    # TODO 138.5: as the sky's image, a used plugin's image parameter is encoded for the browser.
    from hmplot import presentation

    schema = {"picture": {"type": "image"}, "turn": {"type": "vector", "length": 2}}
    used = type("Used", (), {"hooks": {"effect": {"panorama": {"parameters": schema}}, "shade": {}, "transform": {}}})()
    monkeypatch.setattr(plugins, "plugin_of", lambda stage, kind: used if kind == "panorama" else None)
    png = tmp_path / "sky.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\0" * 16)
    spec = hm.effect("panorama", picture=str(png), turn=(1, 2))
    assert spec["turn"] == [1, 2]
    assert spec["picture"] is not None and not isinstance(spec["picture"], str)
    assert hm.effect("panorama", picture="https://example.com/sky.jpg")["picture"] == "https://example.com/sky.jpg"
    with pytest.raises(TypeError, match="Plot.effects: panorama picture is a URL, a file path, bytes or a PIL image; got int."):
        presentation._plugin_values("effect", "panorama", {"picture": 3}, "Plot.effects")


def test_use_plugin_takes_an_installed_name(hatch):
    with pytest.raises(TypeError, match="never a path or code"):
        hm.use_plugin("./hatch.js")
    with pytest.raises(plugins.PluginError, match=r'no installed package provides plugin "acme-glow" .*installed: test-hatch'):
        hm.use_plugin("acme-glow")
    # An installed plugin's kind before hm.use_plugin: the error says to call it.
    with pytest.raises(ValueError, match=r'Points\.shade: shade "hatch" is plugin "test-hatch"\'s; call hm\.use_plugin\("test-hatch"\) first\.'):
        shaded_plot()
    # A kind no installed plugin declares passes to the browser (a page's JavaScript may register it).
    with hm.Plot(data=DATA) as plot:
        hm.Points(x="x", y="y", shade=hm.shade("stripes", spacing=6))
    assert "plugins" not in plot._scene()._snapshot()[0]


def test_a_changed_file_fails_its_hash(tmp_path, monkeypatch):
    copy = tmp_path / "packages"
    shutil.copytree(PACKAGE / "hmplot_test_hatch", copy / "hmplot_test_hatch")
    script = copy / "hmplot_test_hatch" / "hatch.js"
    script.write_text(script.read_text().replace("default: 8", "default: 9"))
    install(tmp_path / "site", copy, monkeypatch)
    with pytest.raises(plugins.PluginError, match=r'Plugin "test-hatch": its file does not match its manifest\'s hash') as error:
        hm.use_plugin("test-hatch")
    assert error.value.code == "plugin.failed"
    assert plugins.used("test-hatch") is None


def test_exported_pages_carry_the_plugin_file_and_templates_record_it(hatch, tmp_path, monkeypatch):
    plugin = hm.use_plugin("test-hatch")
    plot = shaded_plot(spacing=6)
    payload, _ = exporter._html_payload(plot)
    assert payload["state"]["plugins"] == [plugin.ref]
    assert payload["plugins"] == {"test-hatch": {"hash": plugin.hash, "source": plugin.source().decode()}}
    # A template records the plugins it names; loading it uses them.
    @hm.template
    def hatched():
        hm.Points(x="x", y="y", shade=hm.shade("hatch", spacing=6))

    with hm.Plot(data=DATA):
        made = hatched()
    path = made.export_template(tmp_path / "hatched.hmplot.json")
    definition = json.loads(path.read_text())
    assert definition["template"]["plugins"] == [plugin.ref]
    plugins._USED.clear()
    loaded = hm.load_template(path)
    assert plugins.used("test-hatch") is not None
    with hm.Plot(data=DATA) as plot:
        loaded()
    assert plot._scene()._snapshot()[0]["plugins"] == [plugin.ref]
    # One not installed is a warning: its effects and shades draw without it.
    definition["template"]["plugins"] = [{"name": "acme-glow", "version": "2.0.0", "hash": "sha256-AAAA"}]
    path.write_text(json.dumps(definition))
    with pytest.warns(UserWarning, match=r'uses plugin "acme-glow" 2\.0\.0, which is not installed'):
        hm.load_template(path)
    # One installed but unusable (its file changed) is a warning too, not an error.
    definition["template"]["plugins"] = [plugin.ref]
    path.write_text(json.dumps(definition))
    plugins._USED.clear()
    script = PACKAGE / "hmplot_test_hatch" / "hatch.js"
    monkeypatch.setattr(plugins.Plugin, "read", lambda self: script.read_bytes() + b"\n")
    with pytest.warns(UserWarning, match=r'uses plugin "test-hatch", which cannot be used \(Plugin "test-hatch": its file does not match'):
        hm.load_template(path)
    definition["template"]["plugins"] = [{"name": "acme-glow"}]
    path.write_text(json.dumps(definition))
    with pytest.raises(ValueError, match=r"plugins must be a list of \{name, version, hash\}"):
        hm.load_template(path)


def test_a_notebook_view_gets_the_plugin_file_from_the_kernel(hatch, monkeypatch):
    # The widget asks for each plugin its state names; the kernel reads the installed file, and
    # sends nothing for a plugin it does not use (the view then warns plugin.missing).
    plugin = hm.use_plugin("test-hatch")
    plot = shaded_plot(spacing=6)
    scene = plot._scene()
    widget = scene._widget_instance()
    sent = []
    monkeypatch.setattr(widget, "send", lambda content, buffers=None: sent.append((content, buffers)))
    for name in ("test-hatch", "acme-glow"):
        widget._receive(widget, {"type": "plugin_request", "protocol": 1, "scene": scene.id, "view": "v",
                                 "request": name, "name": name, "version": "0.1.0", "hash": plugin.hash}, [])
    assert [(content["type"], content["request"], buffers) for content, buffers in sent] == [
        ("plugin", "test-hatch", [plugin.source()]), ("plugin", "acme-glow", [])]
    scene.close()


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


def test_headless_exports_load_the_plugin_and_draw_without_a_missing_one(hatch, session, tmp_path):
    import io
    from PIL import Image
    plugin = hm.use_plugin("test-hatch")
    # Its file gone (the package removed) while a scene names it: the scene warns that the plugin
    # is not there, and the mark draws unshaded with its own plugin.missing (TODO 138.3).
    file = plugin._file
    plugin._file = file.with_name("gone.js")
    missing = hm.check(shaded_plot(spacing=4), session=session)
    found = {(entry["component"], entry["severity"], entry["code"]) for entry in missing.diagnostics}
    assert found == {("Plugin", "warning", "plugin.missing"), ("Plugin", "error", "plugin.missing")}, missing.diagnostics
    assert any('Plugin "test-hatch" (0.1.0) is not installed here' in entry["message"] for entry in missing.diagnostics)
    # A changed file is not run: the page checks it against the hash the state names.
    changed = tmp_path / "hatch.js"
    changed.write_text(file.read_text().replace("default: 8", "default: 9"))
    plugin._file = changed
    failed = hm.check(shaded_plot(spacing=4), session=session)
    assert {(entry["severity"], entry["code"]) for entry in failed.diagnostics} == {
        ("warning", "plugin.failed"), ("error", "plugin.missing")}, failed.diagnostics
    assert any("does not match the hash the scene names" in entry["message"] for entry in failed.diagnostics)
    # Its file served: the page checks its hash and runs it, and the points draw red stripes.
    plugin._file = file
    plot = shaded_plot(spacing=4, ink="#ff0000")
    result = hm.check(plot, session=session)
    assert result.ok, result.errors
    assert not [entry for entry in result.diagnostics if entry["code"].startswith("plugin.")]
    pixels = Image.open(io.BytesIO(session.png(plot))).convert("RGB")
    assert any(r > 200 and g < 80 and b < 80 for _, (r, g, b) in pixels.getcolors(1 << 24))
    # The page the browser exports carries the file, and opened from disk it runs it.
    page = session.html(plot)
    assert b'"plugins":{"test-hatch":{"hash":"' + plugin.hash.encode() in page
    path = tmp_path / "hatched.html"
    path.write_bytes(page)
    browser, tab = chrome.open_page(path.as_uri(), "window.hmplotDiagnostics", executable=chrome.find_chrome(download=False))
    try:
        tab.wait_for("document.querySelector('#hmplot-root:not(.hmplot-loading) .canvas')?.getAttribute('aria-busy') === 'false'")
        assert tab.evaluate("() => hmplotDiagnostics()") == []
    finally:
        browser.close()


def test_transform_parameters_updates_and_plugin_delivery(monkeypatch):
    schema = {"stepSize": {"type": "number", "default": 2, "min": 0}}
    manifest = {"name": "computation", "version": "1", "apiVersion": 1, "hash": "sha256-test",
                "hooks": {"transform": {"demo.scale": {"parameters": schema}},
                          "layout": {"demo.tree": {"parameters": schema}}}}
    plugin = plugins.Plugin(manifest, None)
    monkeypatch.setattr(plugins, "_USED", {plugin.name: plugin})
    monkeypatch.setattr(plugins, "installed", lambda: {})
    with hm.Plot(data=DATA) as plot:
        with hm.Transform(kind="demo.scale", step_size=3) as transform:
            hm.Points(x="x", y="y")
    assert transform.props == {"kind": "demo.scale", "params": {"stepSize": 3}}
    assert plot._scene()._snapshot()[0]["plugins"] == [plugin.ref]
    transform.update(step_size=4)
    assert transform.props["params"] == {"stepSize": 4}
    with pytest.raises(ValueError, match="stepSize is a number of at least 0"):
        transform.update(step_size=-1)
    assert transform.props["params"] == {"stepSize": 4}
    with pytest.raises(TypeError, match="spelled 'step_size'"):
        hm.Transform(kind="demo.scale", stepSize=2)
    with pytest.raises(ValueError, match="not one of its parameters"):
        hm.Transform(kind="demo.scale", typo=2)
    with pytest.raises(TypeError, match="params=.*or parameter keywords"):
        hm.Transform(kind="demo.scale", params={}, step_size=2)
    tree = hm.Transform(kind="demo.tree", params={"step_size": 5})
    assert tree.props["params"] == {"stepSize": 5}
    tree._apply_edit({"params": {"stepSize": 6}})
    assert tree.props["params"] == {"stepSize": 6}


def test_transform_authoring_example_in_headless_and_exported_html(monkeypatch, session, tmp_path):
    import base64
    import re
    import xml.etree.ElementTree as ET

    docs = (Path(__file__).resolve().parents[2] / "src/routes/content/reference/plugins.svx").read_text()
    source = re.findall(r"```javascript\n(.*?)```", docs, re.S)[0].encode()
    file = tmp_path / "scale.js"
    file.write_bytes(source)
    schema = {"field": {"type": "field", "default": "x"}, "factor": {"type": "number", "default": 2, "min": 0}}
    plugin = plugins.Plugin({"name": "acme-scale", "version": "1.0.0", "apiVersion": 1,
                             "hash": plugins.file_hash(source),
                             "hooks": {"transform": {"acme.scale": {"parameters": schema}}}}, file)
    monkeypatch.setattr(plugins, "_USED", {plugin.name: plugin})
    monkeypatch.setattr(plugins, "installed", lambda: {})
    with hm.Plot(data=DATA, width=320, height=200, axes2d=False, name="Plugin export",
                 x={"domain": [0, 10]}, y={"domain": [0, 4]}) as plot:
        with hm.Transform(kind="acme.scale", field="x", factor=1) as transform:
            hm.Points(x="scaled", y="y", size=10)

    def xs(svg):
        return [float(circle.attrib["cx"]) for circle in ET.fromstring(svg).iter("{http://www.w3.org/2000/svg}circle")]

    before = xs(session.svg(plot))
    transform.update(factor=3)
    after = xs(session.svg(plot))
    assert len(before) == len(after) == 3
    assert after[1] - after[0] == pytest.approx(3 * (before[1] - before[0]), abs=0.05)
    path = tmp_path / "transformed.html"
    path.write_bytes(session.html(plot))
    browser, tab = chrome.open_page(path.as_uri(), "window.hmplotDiagnostics", executable=chrome.find_chrome(download=False))
    try:
        tab.wait_for("document.querySelector('#hmplot-root:not(.hmplot-loading) .canvas')?.getAttribute('aria-busy') === 'false'")
        exported = tab.evaluate(f"async () => hmplotExport('export_svg', {json.dumps(plot.id)}, {{}})")
        assert xs(base64.b64decode(exported["payload"])) == pytest.approx(after, abs=0.05)
        tab.evaluate("""() => document.querySelector('button[aria-label="Settings for Plugin export"]').click()""")
        tab.wait_for("document.querySelector('[role=dialog] [role=treeitem]')")
        tab.evaluate("""() => [...document.querySelectorAll('[role=dialog] [role=treeitem]')].find(item => item.textContent.includes('acme.scale')).click()""")
        tab.wait_for("document.querySelector('[role=dialog] input[aria-label=factor]')")
        tab.evaluate("""() => {
            const input = document.querySelector('[role=dialog] input[aria-label=factor]');
            input.value = '2';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }""")
        edited = tab.evaluate(f"async () => hmplotExport('export_svg', {json.dumps(plot.id)}, {{}})")
        positions = xs(base64.b64decode(edited["payload"]))
        assert positions[1] - positions[0] == pytest.approx(2 * (before[1] - before[0]), abs=0.05)
        # Settings subscriptions are debounced; wait for the exported scene to carry the edit.
        assert tab.evaluate(f"""async () => {{
            for (let attempt = 0; attempt < 40; attempt++) {{
                const result = await hmplotExport('export_html', {json.dumps(plot.id)}, {{ snapshot: false, embedRuntime: false }});
                const html = new DOMParser().parseFromString(atob(result.payload), 'text/html');
                const payload = JSON.parse(html.querySelector('#hmplot-state').textContent);
                if (JSON.stringify(payload).includes('"factor":2')) return true;
                await new Promise(resolve => setTimeout(resolve, 50));
            }}
            return false;
        }}""")
        assert tab.evaluate("() => hmplotDiagnostics()") == []
    finally:
        browser.close()


def test_large_graph_plugin_regenerates_100000_nodes_from_python_and_html(session, tmp_path):
    import base64
    import io
    import runpy
    from PIL import Image, ImageChops

    path = Path(__file__).resolve().parents[2] / "src/examples/large-graph/large-graph.py"
    scene = runpy.run_path(str(path))["scene"]
    def walk(node):
        yield node
        for child in node.children:
            yield from walk(child)
    controls = {node.props.get("name"): node for node in walk(scene) if node.kind in ("Select", "Button")}
    controls["nodes"].value = 100000
    def image(data):
        return Image.open(io.BytesIO(data)).convert("RGB")
    before = image(session.png(scene, scale=2))
    controls["regenerate"].value = 43
    after = image(session.png(scene, scale=2))
    assert ImageChops.difference(before, after).getbbox() is not None
    assert session.page.evaluate("() => hmplotDiagnostics().filter(d => d.severity !== 'lint')") == []
    html = tmp_path / "large-graph.html"
    html.write_bytes(session.html(scene))
    browser, tab = chrome.open_page(html.as_uri(), "window.hmplotDiagnostics", executable=chrome.find_chrome(download=False))
    try:
        tab.wait_for("document.querySelector('#hmplot-root:not(.hmplot-loading) .canvas')?.getAttribute('aria-busy') === 'false'", timeout=90)
        first = tab.evaluate(f"async () => hmplotExport('export_png', {json.dumps(scene.id)}, {{ scale: 2 }})")
        tab.evaluate("""() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Regenerate graph').click()""")
        second = tab.evaluate(f"async () => hmplotExport('export_png', {json.dumps(scene.id)}, {{ scale: 2 }})")
        assert ImageChops.difference(image(base64.b64decode(first["payload"])), image(base64.b64decode(second["payload"]))).getbbox() is not None
        assert tab.evaluate("() => hmplotDiagnostics().filter(d => d.severity !== 'lint')") == []
    finally:
        browser.close()


def test_recursive_parameter_schemas():
    schema = {
        "band": {"type": "union", "variants": [{"type": "number", "min": 0, "max": 1}, {"type": "select", "options": [False]}]},
        "bounds": {"type": "object", "properties": {"x": {"type": "array", "items": {"type": "number"}, "minLength": 2, "maxLength": 2}}, "required": ["x"]},
    }
    plugins._check_schema("demo", schema)
    assert not plugins._value_problem("band", schema["band"], False)
    assert plugins._value_problem("band", schema["band"], True)
    assert not plugins._value_problem("bounds", schema["bounds"], {"x": [0, 2]})
    assert "not a declared property" in plugins._value_problem("bounds", schema["bounds"], {"z": 1})
    assert "required" in plugins._value_problem("bounds", schema["bounds"], {})
    assert "array" in plugins._value_problem("bounds", schema["bounds"], {"x": [0]})
    assert "bounds.x[0]" in plugins._value_problem("bounds", schema["bounds"], {"x": [None, 1]})
    assert plugins._value_problem("optional", {"type": "object", "properties": {"x": {"type": "number"}}}, {"x": None}) == ""
    with pytest.raises(ValueError, match="nonempty variants"):
        plugins._check_schema("demo", {"bad": {"type": "union", "variants": []}})


def test_field_parameters_accept_numeric_row_values_with_missing_entries():
    import numpy as np
    parameter = {"type": "field"}
    assert not plugins._value_problem("x", parameter, [1, None, True, float("nan")])
    assert not plugins._value_problem("x", parameter, np.array([1, 2], dtype=np.float32))
    assert plugins._value_problem("x", parameter, ["wrong"])
