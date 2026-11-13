"""TODO 136.4: characterization tests for the state round trip, before 136.7 replaces how settings
are stored and exported. For each scene: the exported page goes live from disk without errors,
every exported node carries the props its author gave it and no others (a replayed setting or a
derived value is how 134.7 and 135.9 broke pages), and rendering the scene writes nothing back to
its Python props."""
import copy
import json
import re

import numpy as np
import pandas as pd
import pytest

import hmplot as hm
from hmplot import exporter


@pytest.fixture(scope="module")
def session():
    session = exporter.ExportSession().__enter__()
    try:
        session._ensure_browser()
    except Exception as error:  # no browser or no WebGPU on this machine
        pytest.skip(f"headless export unavailable: {error}")
    yield session
    session.__exit__(None, None, None)


def fill_scale_scene():
    # 134.7 / 135.9: a shared fill scale with quantized levels.
    rng = np.random.default_rng(0)
    data = {"x": rng.uniform(size=50), "y": rng.uniform(size=50), "v": rng.uniform(-1, 1, 50)}
    with hm.Plot(data=data, height=240) as plot:
        hm.Points(x="x", y="y", fill="v",
                  fill_scale=hm.continuous(domain=[-1, 1], colormap="RdBu", quantize=True, levels=5))
    return plot


def datetime_facet_scene():
    # 135.1: facet cells over a datetime column.
    times = pd.date_range("2025-01-01", periods=40, freq="h")
    data = {"time": np.tile(times.values, 2), "v": np.arange(80.0), "site": np.repeat(["a", "b"], 40)}
    with hm.Facet(data=data, column="site") as facet:
        with hm.Plot(height=200):
            hm.Points(x="time", y="v")
    return facet


def plain_scene():
    with hm.Plot(data={"x": [0.0, 1.0, 2.0], "y": [1.0, 0.0, 2.0]}, height=200) as plot:
        hm.Line(x="x", y="y")
    return plot


def legend_scene():
    data = {"region": ["N", "S"], "product": ["A", "B"], "v": [1.0, 2.0]}
    with hm.Plot(data=data, height=200, legend=True) as plot:
        bars = hm.charts.Bar(x="region", y="v", fill="product")
        hm.Legend(target=bars, channel="fill", label="Product")
    return plot


SCENES = {"fill-scale": fill_scale_scene, "datetime-facet": datetime_facet_scene,
          "plain-2d": plain_scene, "legend": legend_scene}


def authored(node):
    """Each node's authored prop names, by id."""
    out, stack = {}, [node._scene() if hasattr(node, "_scene") else node]
    while stack:
        current = stack.pop()
        out[current.id] = set(current.props)
        stack.extend(current.children)
    return out


def exported_nodes(page):
    state = json.loads(re.search(r'<script id="hmplot-state" type="application/json">(.*?)</script>', page, re.S).group(1))
    out, stack = {}, [state["state"]["root"]]
    while stack:
        node = stack.pop()
        out[node["id"]] = (node.get("kind"), set(node.get("props", {})))
        stack.extend(node.get("children", []))
    return out


def leaked_props(target, page):
    """Exported props the author did not give, by node."""
    snake = lambda key: re.sub(r"[A-Z]", lambda m: "_" + m.group(0).lower(), key)
    given, extra = authored(target), {}
    for node_id, (kind, keys) in exported_nodes(page).items():
        leaked = {key for key in keys if key not in given.get(node_id, keys) and snake(key) not in given.get(node_id, ())}
        if leaked:
            extra[f"{kind} {node_id[-6:]}"] = sorted(leaked)
    return extra


@pytest.mark.parametrize("name", list(SCENES))
def test_an_exported_page_goes_live_without_errors(session, tmp_path, name):
    target = SCENES[name]()
    path = tmp_path / f"{name}.html"
    session.html(target, path)
    tab = session.browser.new_page()
    tab.call("Page.addScriptToEvaluateOnNewDocument", {"source":
        # A ResizeObserver loop warning is a layout feedback loop, not a failure (TODO 136.10).
        "window.__errors=[];addEventListener('error',(e)=>{if(!/ResizeObserver loop/.test(e.message))__errors.push(e.message)});"
        "addEventListener('unhandledrejection',(e)=>__errors.push(String(e.reason?.message??e.reason)));"})
    try:
        tab.goto(path.as_uri())
        try:
            tab.wait_for("!document.getElementById('hmplot-snapshot') && document.querySelectorAll('#hmplot-root .canvas').length > 0"
                         " && [...document.querySelectorAll('#hmplot-root .canvas')].every((c) => c.getAttribute('aria-busy') === 'false')")
        except RuntimeError as error:
            raise AssertionError(f"{name}: the page did not go live: {error}; errors: {tab.evaluate('() => __errors')}") from None
        assert tab.evaluate("() => [document.getElementById('hmplot-status').textContent, __errors]") == ["Interactive plot", []]
    finally:
        tab.close()


# An export replayed every setting a Plot had (about 50: margins, camera, animation, ...) and the
# marks' defaults: core problem 6. Since 136.7 it carries the authored props and the viewer's
# edits (the user layer) only.
@pytest.mark.parametrize("name", list(SCENES))
def test_an_export_carries_the_authored_props_only(session, name):
    target = SCENES[name]()
    assert leaked_props(target, session.html(target).decode("utf-8")) == {}


@pytest.mark.parametrize("name", list(SCENES))
def test_rendering_a_scene_writes_nothing_back_to_its_props(session, name):
    target = SCENES[name]()
    scene = target._scene()
    stack, before = [scene], {}
    while stack:
        node = stack.pop()
        before[node.id] = copy.deepcopy({k: v for k, v in node.props.items() if not isinstance(v, (hm.Node,))})
        stack.extend(node.children)
    result = hm.check(target, session=session)
    assert result.ok, result.errors
    stack, after = [scene], {}
    while stack:
        node = stack.pop()
        after[node.id] = {k: v for k, v in node.props.items() if not isinstance(v, (hm.Node,))}
        stack.extend(node.children)
    changed = {node_id: sorted(set(before[node_id]) ^ set(after[node_id])) for node_id in before
               if set(before[node_id]) != set(after.get(node_id, {}))}
    assert changed == {}, f"rendering changed the scene's props: {changed}"


def test_late_browser_errors_are_reported_in_scene_diagnostics_without_a_rollback():
    # TODO 136.6 (decided 2026-10-13): an error after the scene was accepted is reported, the scene
    # is not rolled back. The widget's message, as the runtime sends it.
    with hm.Scene() as scene:
        with hm.Plot(height=200) as plot:
            hm.Points(x=[1.0, 2.0], y=[1.0, 2.0])
    props = dict(plot.props)
    entry = {"severity": "error", "code": "gpu.device-lost", "component": "Plot", "node": plot.id,
             "message": "The GPU device was lost.", "property": None}
    scene._receive({"scene": scene.id, "type": "diagnostics", "diagnostics": [entry], "revision": scene.revision}, [])
    assert scene.diagnostics == [{k: v for k, v in entry.items() if v is not None}]
    assert plot.props == props and scene.error is None
    # A list from an older revision describes a scene that is gone.
    scene._receive({"scene": scene.id, "type": "diagnostics", "diagnostics": [], "revision": scene.revision - 1}, [])
    assert len(scene.diagnostics) == 1
