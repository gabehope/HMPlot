"""Every keyword the generated stubs advertise must be accepted at runtime."""
import functools
import inspect
import json
import re
import textwrap
from pathlib import Path

import numpy as np
import pytest
import hmplot as hm
from hmplot.core import REGISTRY, _component_names, accepted_property

SIGNATURES = json.loads((Path(hm.__file__).parent / "signatures.json").read_text())
CONSTRUCTOR_ONLY = {"filename", "export_options"}


@pytest.mark.parametrize("component", sorted(SIGNATURES))
def test_stub_keywords_are_exactly_the_accepted_ones(component):
    # TODO 40.2: the stub lists every keyword the runtime takes, settings included, and no other:
    # with no **props, a misspelled keyword is a type error, and the two cannot drift apart.
    rejected = [k for k in SIGNATURES[component]
                if k not in CONSTRUCTOR_ONLY and accepted_property(component, k) is None]
    assert rejected == []
    advertised, settings = _component_names(component)
    listed = {accepted_property(component, k) for k in SIGNATURES[component] if k not in CONSTRUCTOR_ONLY}
    assert sorted(advertised | settings) == sorted(listed)


def test_registry_lists_each_components_properties():
    for component in SIGNATURES:
        assert "properties" in REGISTRY["components"][component], component


def test_html_is_javascript_only():
    assert REGISTRY["components"]["Html"]["languages"] == "js"
    assert "Html" not in SIGNATURES
    assert "Html" not in hm.__all__
    assert not hasattr(hm, "Html")


def test_previously_rejected_keywords_construct():
    with hm.Scene():
        with hm.Plot(data={"a": [1.0], "b": [2.0], "id": [1]}):
            hm.charts.Violin(x="a", y="b", side="left")
            hm.charts.BoxPlot(x="a", y="b", whisker=1.5, outliers=False, outlier_size=4)
            hm.GeoJSON(geometry="a", feature_key="id", data_key="id")
            with hm.Calculate(median=hm.quantile("a", 0.5)):
                hm.Points(x="a", y="median")
            with hm.Sample(proportion=0.5):
                hm.Points(x="a", y="b")


def test_unknown_property_suggests_the_nearest_valid_name():
    with pytest.raises(TypeError, match=r"Violin: unknown property 'sides'.*side"):
        with hm.Scene():
            with hm.Plot(data={"a": [1.0], "b": [2.0]}):
                hm.charts.Violin(x="a", y="b", sides="left")


def test_properties_are_gated_per_component():
    # Names another component accepts are not accepted here.
    with pytest.raises(TypeError, match=r"Points: unknown property 'whisker'"):
        hm.Points(whisker=1.5, probabilities=[.5], feature_key="id")
    for key, value in (("probabilities", [.5]), ("feature_key", "id")):
        with pytest.raises(TypeError, match=rf"Points: unknown property '{key}'"):
            hm.Points(**{key: value})
    with pytest.raises(TypeError, match=r"Points: unknown property 'sizes'.*'size'"):
        hm.Points(sizes=4)
    # The settings the options table lists are accepted, as are the props; 2D points have no
    # size attenuation (a 3D perspective setting).
    hm.Points(x="x", y="y", lit=True)
    hm.Points3D(x="x", y="y", size_attenuation=False)
    with pytest.raises(TypeError, match=r"Points: unknown property 'size_attenuation'"):
        hm.Points(size_attenuation=False)
    hm.Heatmap(surface_mode=True)
    hm.charts.BoxPlot(x="a", y="b", whisker=1.5)
    hm.Frame(x={"scale": hm.categorical(domain=["a", "b"])})
    hm.LinkViews(axes="x")
    # Mapping takes what it hands the marks inside it (utils/mapping.js), and nothing they ignore.
    hm.Mapping(x="x", opacity=0.9, curve="step")
    with pytest.raises(TypeError, match=r"Mapping: unknown property 'whisker'"):
        hm.Mapping(whisker=1.5)


def test_browser_setting_edits_use_the_components_declared_properties():
    # Browser edits are camelCase, but cannot bypass component or nested-object validation.
    assert accepted_property("Points", "billboard") is None
    with hm.Scene() as scene:
        with hm.Plot(x={"domain": [0, 10], "range": [-40, 40]}) as plot:
            points = hm.Points(position=[[0, 0]])
    scene._views["v"] = {"ready": True}
    def edit(node, props):
        scene._receive({"type": "edit", "scene": scene.id, "view": "v", "revision": scene.revision,
                        "target": node.id, "props": props}, [])
    for key in ("billboard", "pending", "mounted", "requestKey", "plotScene", "inputOwner"):
        with pytest.raises(TypeError, match=rf"Points: unknown property '{key}'"):
            edit(points, {"opacity": 0.5, key: True})
        assert "opacity" not in points.props, "failed edits roll back the whole patch"
    edit(points, {"colormap": "Magma", "fill": {"$literal": "red"}})
    edit(plot, {"x": {"domain": [1, 20], "range": [-40, 40], "tickCount": 4}, "axisFontFamily": "serif"})
    assert points.props["colormap"] == "Magma"
    assert points.props["fill"] == {"$literal": "red"}
    assert plot.props["x"] == {"domain": [1, 20], "range": [-40, 40], "tickCount": 4}
    assert plot.props["axisFontFamily"] == "serif"
    with pytest.raises(ValueError, match=r"Plot\.x: unknown key 'pending'"):
        edit(plot, {"x": {"pending": True}})
    for kind in ("Template", "Slot"):
        assert _component_names(kind) == (frozenset(), frozenset())
        assert accepted_property(kind, "opacity") is None


def test_stub_types_channels_and_option_dicts():
    # 34.4: channels use one Channel alias, and dict options are TypedDicts with snake_case keys,
    # defined in the generated hmplot._types and re-exported by the package and its stub.
    import ast
    import re
    from hmplot import _types
    package = Path(hm.__file__).parent
    stub, types = (package / "__init__.pyi").read_text(), (package / "_types.py").read_text()
    ast.parse(stub)
    # 40.2: every keyword is listed; only Calculate takes others (its output columns).
    assert "**props" not in stub and stub.count("**outputs: Any") == 2
    assert SIGNATURES["Points"]["fill"] == "Channel" and SIGNATURES["Line"]["x"] == "Channel"
    assert SIGNATURES["Plot"]["x"] == "AxisDefinition" and SIGNATURES["Frame"]["placement"] == "TypingLiteral[\"fit\"] | FramePlacement"
    assert re.search(r"^Channel: TypeAlias = str \| float .*\| Expression .*\| Column \| SupportsArray$", types, re.M)
    assert "class AxisDefinition(TypedDict, total=False):\n" in types and "    tick_count: float\n" in types
    used = {word for params in SIGNATURES.values() for text in params.values() for word in re.findall(r"\w+", text)}
    assert {name for name in REGISTRY["objects"] if name in used} <= set(_types.__all__)
    # Re-exported (a stub's plain import is private), and the same objects at run time.
    assert all(f"    {name} as {name},\n" in stub for name in _types.__all__)
    assert all(getattr(hm, name) is getattr(_types, name) for name in _types.__all__)
    assert "from .core import Input as Input, Node as Node, Scene as Scene," in stub


def test_option_dict_keys_are_converted_and_checked():
    # 34.4c: the browser reads camelCase and rejects other keys only after the scene is sent.
    plot = hm.Plot(x={"tick_count": 3, "major_interval": {"unit": "day", "step": 1}}, y={"tickCount": 4},
                   viewport={"x": 0.5, "y": 0.5, "zoom": 2, "zoom_x": 3}, rules=[{"axis": "x", "value": 1}])
    assert plot.props["x"] == {"tickCount": 3, "majorInterval": {"unit": "day", "step": 1}}
    assert plot.props["y"] == {"tickCount": 4} and plot.props["viewport"]["zoomX"] == 3
    plot.update(x={"title_offset": 9})
    assert plot.props["x"] == {"titleOffset": 9}
    assert hm.Frame(placement={"anchor": [0, 0], "size": [1, 1]}).props["placement"]["version"] == 1
    with pytest.raises(ValueError, match=r"Plot\.x: unknown key 'tick_cout'\. Did you mean 'tick_count'\? Accepted keys: domain, "):
        hm.Plot(x={"tick_cout": 3})
    with pytest.raises(ValueError, match=r"Plot\.x\.major_interval: unknown key 'units'"):
        hm.Plot(x={"major_interval": {"units": "day", "step": 1}})
    with pytest.raises(ValueError, match=r"'tickCount' repeats the key 'tick_count' in another spelling"):
        hm.Plot(x={"tick_count": 3, "tickCount": 4})
    # TODO 128: PlotSettings' show_export and menu, on a Plot and a Facet.
    settings = {"show_trigger": False, "show_export": False, "menu": False}
    assert hm.Plot(settings=settings).props["settings"] == {"showTrigger": False, "showExport": False, "menu": False}
    assert hm.Facet(column="g", settings={"menu": False}).props["settings"] == {"menu": False}
    # A channel's dict is data (a dictionary column), not options: its keys pass unchanged.
    column = {"codes": [0, 1], "categories": ["a", "b"]}
    assert hm.Points(x=[0.0, 1.0], y=[0.0, 1.0], fill=column).props["fill"] == column


REFERENCE_EXAMPLES = sorted((Path(__file__).resolve().parents[2] / "src/examples").glob("*/*.py"))
# hmplot's optional dependencies (pyproject.toml's extras), and PIL (Pillow, in the test extra),
# which the Earth and solar system examples read their images with. An example may import one, as
# the home page's penguins read their CSV with pandas; an install without it skips that example.
OPTIONAL_MODULES = {"pandas", "polars", "pyarrow", "xarray", "netCDF4", "cftime", "PIL"}


@pytest.mark.parametrize("path", REFERENCE_EXAMPLES, ids=lambda path: path.stem)
def test_reference_examples_build(path, monkeypatch):
    # R2.0b.2: each reference page opens with a complete program. It leaves one display handle at
    # top level (the rule the docs' Pyodide worker uses), whose scene validates and snapshots.
    monkeypatch.chdir(path.parent)
    namespace = {"__name__": "__main__"}
    try:
        exec(compile(path.read_text(), str(path), "exec"), namespace)
    except ModuleNotFoundError as error:
        if error.name not in OPTIONAL_MODULES:
            raise
        pytest.skip(f"{path.name} imports {error.name}, an optional dependency that is not installed")
    # A chain's hm.Data (TODO 144) is a source the displayed scene includes, not a display handle.
    roots = {id(value): value for value in namespace.values() if isinstance(value, hm.Node) and value.parent is None
             and not getattr(value, "_chain_root", False)}
    assert len(roots) == 1, f"{path.name} leaves {len(roots)} display handles"
    scene = next(iter(roots.values()))._scene()
    scene._validate()
    scene._snapshot()


# R2.7: the agent skills' programs (skills/hmplot/*.md, and the eval's fluent skill, TODO 144), each complete: it runs, leaves one display
# handle and validates, as a reference example does. test_animation.py draws each with hm.check.
SKILL_PROGRAMS = [(f"{path.parent.parent.name if path.parent.name == 'skill' else path.parent.name}/{path.stem}-{index + 1}", code)
                  for path in [*sorted((Path(__file__).resolve().parents[2] / "skills").glob("*/*.md")),
                               *sorted((Path(__file__).resolve().parents[2] / "eval/agent-tasks/variants").glob("*/skill/*.md"))]
                  # translation.md's snippets compare spellings with other libraries: fragments, not programs.
                  if path.name != "translation.md"
                  for index, code in enumerate(re.findall(r"```python\n(.*?)```", path.read_text(), re.S))]


def skill_scene(code):
    """The scene a skill program displays (its one top-level component's)."""
    namespace = {"__name__": "__main__"}
    exec(compile(code, "skill program", "exec"), namespace)
    # A chain's hm.Data (TODO 144) is a source the displayed scene includes, not a display handle.
    roots = {id(value): value for value in namespace.values() if isinstance(value, hm.Node) and value.parent is None
             and not getattr(value, "_chain_root", False)}
    assert len(roots) == 1, f"the program leaves {len(roots)} display handles"
    return next(iter(roots.values()))


@pytest.mark.parametrize("code", [code for _, code in SKILL_PROGRAMS], ids=[name for name, _ in SKILL_PROGRAMS])
def test_skill_programs_build(code):
    assert len(SKILL_PROGRAMS) >= 11
    scene = skill_scene(code)._scene()
    scene._validate()
    scene._snapshot()


ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "src/routes/content/reference"


def test_translation_guide_names_every_public_name():
    """skills/hmplot/translation.md maps every public component, chart, statistical pattern,
    expression function and interaction state to another library's word, so an agent that knows
    the concept in another library finds HMPlot's name (the eval's vocabulary failures). An option
    is listed only when it is shared or spells a known concept; this does not check options."""
    text = (ROOT / "skills/hmplot/translation.md").read_text()
    tokens = set(re.findall(r"`([^`]*)`", text))
    def listed(name):
        return any(re.search(rf"(?<!\w){re.escape(name)}(?!\w)", token) for token in tokens)
    components = [n for n in dir(hm) if not n.startswith("_") and inspect.isclass(getattr(hm, n)) and issubclass(getattr(hm, n), hm.Node)
                  and n not in ("Node", "Input")]
    charts = [f"charts.{n}" for n in dir(hm.charts) if n[:1].isupper()]
    stats = [f"stats.{n}" for n in dir(hm.stats) if n[:1].isupper()]
    expressions = [n for n in dir(hm.expressions) if n[:1].islower() and not n.startswith("_")
                   and callable(getattr(hm.expressions, n)) and n not in ("has_live_marker", "live_text")]
    resources = ["selection", "identity", "continuous", "categorical", "ordinal", "colormap", "normalization",
                 "create_theme", "connect", "light", "effect", "shade", "literal", "rgb", "register_shape", "animate",
                 "check", "visualize_tree", "export_png", "export_svg", "export_pdf", "export_html", "export_mp4",
                 "typed_column", "template", "slot", "load_template", "load_theme", "use_plugin", "linkage_table", "stream"]
    states = [f"@{n}" for n in hm.STATE_NAMES if not n.startswith("any_")]
    missing = [n for n in [*components, *charts, *stats, *expressions, *resources, *states] if not listed(n)]
    assert missing == [], f"translation.md does not name {missing}"
    for name in ["## Not in HMPlot", "## Interaction", "## Expressions", "## Animation"]:
        assert name in text
# The Python member tables of the handle and resource pages (TODO 69.9), and whether the page
# lists the whole interface (the transform page lists the members a transform is used through).
HANDLE_PAGES = {
    "plot-handle": (lambda: hm.Plot(), True),
    "transform-handle": (lambda: hm.stats.Bin(x="value"), False),
    "selection": (lambda: hm.selection(), True),
    "identity": (lambda: hm.identity(keys=[1, 2, 3]), True),
}


def _table_rows(page):
    """(member, kind) for each row of the page's tables: | `update(**props)` | sync | ... |."""
    text = (REFERENCE / f"{page}.svx").read_text()
    return re.findall(r"^\| `([^`]+)` \| (\w+) \|", text, re.M)


def _kind(owner, name):
    raw = inspect.getattr_static(owner, name)
    if isinstance(raw, property):
        return "property"
    if inspect.iscoroutinefunction(raw):
        return "await"
    if inspect.isfunction(raw) or inspect.isclass(raw):
        return "sync"
    return "attribute"


@pytest.mark.parametrize("page", sorted(HANDLE_PAGES))
def test_python_member_tables_match_python(page):
    # Each row is a member Python has, with that kind (sync, await, property or attribute) and,
    # for a call, exactly its signature; rows starting hm. are the module's functions. Checked
    # against the objects, not derived from the TypeScript interface.
    make, whole = HANDLE_PAGES[page]
    target = make()
    documented = set()
    for member, kind in _table_rows(page):
        owner, member = (hm, member[3:]) if member.startswith("hm.") else (target, member)
        name, paren, params = member.partition("(")
        # getattr_static: reading a property such as selection would ask for the node's data.
        assert name in dir(owner), f"{page}: {name} is not a member"
        assert _kind(owner, name) == kind, f"{page}: {name} is {_kind(owner, name)}, not {kind}"
        if paren:
            assert f"({params}" == str(inspect.signature(getattr(owner, name))), f"{page}: {member}"
        if owner is target:
            documented.add(name)
    public = {name for name in dir(target) if not name.startswith("_")}
    if whole:
        assert documented == public, f"{page}: missing {sorted(public - documented)}"
    else:
        assert {"update", "when_settled", "action"} <= documented <= public


def test_reference_python_spellings_name_python_functions():
    # The Python spellings in the reference's tables (src/routes/examples/api.js) name functions
    # hm has, with its parameter names (a function of *args takes any names).
    api = (ROOT / "src/routes/examples/api.js").read_text()
    spellings = re.findall(r'"hm\.(\w+)(?:\(([^"]*)\))?"', api)
    assert len(spellings) > 60
    for name, params in spellings:
        assert hasattr(hm, name), f"hm.{name}"
        function = getattr(hm, name)
        if not params or not callable(function):
            continue
        parameters = inspect.signature(function).parameters.values()
        if any(p.kind is p.VAR_POSITIONAL for p in parameters):
            continue
        named = [p.name for p in parameters if p.kind is not p.VAR_KEYWORD]
        written = [part.split("=")[0].strip().lstrip("*") for part in params.split(",")]
        assert [part for part in written if part] == named, f"hm.{name}({params})"


# R2.5: every public name has a docstring with an example, where an editor reads it: the stub's
# declaration, or the module's own where the stub re-exports a module without one (exporter.py,
# hierarchy.py). Public: hm.__all__, and hm.min, max, sum, round, any, all, input, prev and view, which stay
# out of it so a star import does not shadow the builtins.
PUBLIC = [*hm.__all__, "min", "max", "sum", "round", "any", "all", "input", "prev", "view", "STATE_NAMES"]
PACKAGE = Path(hm.__file__).parent


def _declarations(path):
    """{name: docstring or None} of a module's top-level classes, functions and variables (a
    variable's docstring is the string after it). A class's is its own, else its __init__'s."""
    import ast
    body, found = ast.parse(path.read_text()).body, {}
    for i, node in enumerate(body):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            found[node.name] = ast.get_docstring(node)
        elif isinstance(node, ast.ClassDef):
            init = next((item for item in node.body if isinstance(item, ast.FunctionDef) and item.name == "__init__"), None)
            found[node.name] = ast.get_docstring(node) or (init and ast.get_docstring(init))
        elif isinstance(node, (ast.AnnAssign, ast.Assign)):
            after = body[i + 1] if i + 1 < len(body) else None
            doc = after.value.value if isinstance(after, ast.Expr) and isinstance(after.value, ast.Constant) and isinstance(after.value.value, str) else None
            for target in [node.target] if isinstance(node, ast.AnnAssign) else node.targets:
                if isinstance(target, ast.Name):
                    found[target.id] = inspect.cleandoc(doc) if doc else None
    return found


@functools.cache
def _public_docstrings():
    import ast
    stub = PACKAGE / "__init__.pyi"
    own, imported = _declarations(stub), {}
    for node in ast.parse(stub.read_text()).body:
        if isinstance(node, ast.ImportFrom) and node.level == 1 and node.module:
            for alias in node.names:
                imported[alias.asname or alias.name] = (node.module, alias.name)
    docs = {}
    for name in PUBLIC:
        if name in ("charts", "stats"):
            docs[name] = inspect.getdoc(getattr(hm, name))
        elif name in own:
            docs[name] = own[name]
        elif name in imported:
            module, original = imported[name]
            source = PACKAGE / f"{module}.pyi"
            docs[name] = _declarations(source if source.exists() else PACKAGE / f"{module}.py").get(original)
        else:
            docs[name] = None
    return docs


def _example(doc):
    """The code of a docstring's Example: section."""
    lines = doc.split("\n")
    start = lines.index("Example:") + 1
    end = next((i for i in range(start, len(lines)) if lines[i] and not lines[i].startswith(" ")), len(lines))
    return textwrap.dedent("\n".join(lines[start:end])).strip()


def test_every_public_name_has_a_docstring_with_an_example():
    docs = _public_docstrings()
    assert len(docs) > 200
    assert [name for name, doc in docs.items() if not doc] == []
    assert [name for name, doc in docs.items() if "\nExample:\n" not in doc] == []


# An example that needs a browser, a file, a dataset or a plugin package of the reader's is
# compiled, not run.
NOT_RUN = re.compile(r"\bawait\b|export_|install_chrome|load_theme\(|\bstream\(|session\.|\bcheck\(|use_plugin\(")
COMPONENTS = {{"LayoutGrid": "Grid"}.get(name, name) for name in REGISTRY["components"]}


@pytest.mark.parametrize("name", [name for name in PUBLIC if name not in COMPONENTS])
def test_docstring_examples_run(name):
    # The components' examples are their reference pages' programs (test_reference_examples_build).
    import ast
    code = _example(_public_docstrings()[name])
    compile(code, name, "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    if not NOT_RUN.search(code):
        exec(compile(code, name, "exec"), {"hm": hm})


def _in_scene(build):
    """A scene built by `build` (called inside its with block), validated as display would."""
    def run():
        with hm.Scene() as scene:
            build()
        scene._validate()
    return run


def _with(component):
    def run():
        with component:
            pass
    return run


# R2.5: validation errors name the component (or function) and say what to pass instead. A
# representative set, one per kind of mistake: a misspelled or camelCase keyword, a wrong dict
# key, events, children, tables and their columns, scales, expressions, layout and references.
ERRORS = [
    (lambda: hm.Points(x="x", colr="red"), "Points", r"Did you mean 'color'\?"),
    (lambda: hm.Points(x="x", fillScale=None), "Points", r"spelled 'fill_scale' in Python"),
    (lambda: hm.Plot(x={"tick_cout": 3}), "Plot.x", r"Did you mean 'tick_count'\?"),
    (lambda: hm.Plot(legend={"position": "middle"}), "Plot", r"position must be one of top, bottom, left, right"),
    (lambda: hm.Points(x="x").on_event("hover", print), "Points.on_event", r"use one of click, dblclick"),
    (lambda: hm.Points(x="x").on_event("click", 5), "Points.on_event", r"must be a function that takes the event"),
    (lambda: hm.Points(hm.Line()), "Points", r"Put it inside a container"),
    (lambda: hm.Plot(5), "Plot", r"Pass data as data= and options as keywords"),
    (_with(hm.Points(x="x")), "Points", r"create it inside one \(with hm\.Plot\(\): hm\.Points\(\.\.\.\)\)"),
    (lambda: hm.Data(), "Data", r"hm\.Data\(table\)"),
    (lambda: hm.Join(how="outer", on="k", data={"k": [1]}), "Join", r'"left" or "inner"'),
    (lambda: hm.Table({"a": [1, 2], "b": [1]}), "Table", r"the same number of rows; a has 2, b has 1"),
    (lambda: hm.Table({"a": [1]}, key="id"), "Table key", r"one of 'a'"),
    (lambda: hm.Table({"a": [1, 2]}, schema={"a": "number"}), "Column 'a'", r"type is one of boolean, categorical, datetime"),
    (lambda: hm.Table({"a": [1, 1]}, key="a"), "Table keys", r"Choose a key that differs for every row"),
    (lambda: hm.Table({"a": np.array([1 + 2j])}), "Column 'a'", r"np\.abs\(values\)"),
    (lambda: hm.normalization(transform="pow"), "normalization transform", r"use linear, log, sqrt, symlog"),
    (lambda: hm.colormap(["#ff0000"]), "colormap", r"at least two CSS color strings"),
    (lambda: hm.col("@time"), "hm.col", r"use hm\.view\.time"),
    (lambda: hm.mean(), "mean()", r'such as hm\.mean\("x"\)'),
    (lambda: hm.Points(x="x", y=hm.animate("y") + 1), "animate()", r"hm\.animate\(hm\.col\.y \+ 1\)"),
    (lambda: hm.visualize_tree(5), "visualize_tree", r"such as a Plot or Scene"),
    (_in_scene(lambda: hm.Points(x=[1], y=[2])), "Points", r"with hm\.Plot\(\):"),
    # The Points is made outside the scene (a default argument): the Legend refers to it.
    (_in_scene(lambda points=hm.Points(x=[1], y=[2]): hm.Plot(hm.Legend(target=points))), "Legend.target", r"add that Points to the scene"),
    (_in_scene(lambda: hm.Simulate(update={"x": hm.prev.x})), "Simulate", r"initial=\{\.\.\.\}"),
    (_in_scene(lambda: hm.Plot(effects=[hm.effect("fog", near=1, far=10)])), "Plot", r'Set type="3d" on it, or remove the fog'),
    (_in_scene(lambda: hm.Slider(name="1 bins")), "Slider", r"an identifier such as 'bins'"),
]


@pytest.mark.parametrize("make, component, fix", ERRORS, ids=[f"{i}-{c}" for i, (_, c, _) in enumerate(ERRORS)])
def test_errors_name_the_component_and_what_to_pass(make, component, fix):
    with pytest.raises((TypeError, ValueError)) as caught:
        make()
    message = str(caught.value)
    assert component in message, message
    assert re.search(fix, message), message


@pytest.mark.parametrize("tier", ["charts", "stats"])
def test_pattern_namespace_matches_registry_and_old_names_explain_the_move(tier):
    module = getattr(hm, tier)
    expected = {name for name, spec in REGISTRY["components"].items() if spec.get("tier") == tier}
    assert set(module.__all__) == expected
    for name in expected:
        chart = getattr(module, name)
        assert chart.kind == name and chart.__module__ == f"hmplot.{tier}"
        assert set(inspect.signature(chart).parameters) - {"children"} == set(SIGNATURES[name])
        with pytest.raises(AttributeError, match=rf"hm\.{name} moved to hm\.{tier}\.{name}"):
            getattr(hm, name)
    with hm.Plot() as plot:
        bar = hm.charts.Bar(x=["A"], y=[2])
    assert bar.kind == "Bar" and bar.parent is plot
