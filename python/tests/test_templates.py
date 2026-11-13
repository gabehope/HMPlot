"""Stage 27: Python templates (hm.Template, @hm.template, hm.slot())."""
import asyncio
import inspect
import json
import re
from pathlib import Path
from contextlib import contextmanager

import pytest

import hmplot as hm
from hmplot.core import REGISTRY, Slot, flatten
from hmplot.introspection import visualize_tree

DATA = {"a": [1.0, 2.0], "b": [3.0, 4.0]}


def kinds(node):
    """The tree as nested (kind, children) pairs, templates by their class name."""
    name = type(node).__name__ if isinstance(node, hm.Template) else node.kind
    return (name, [kinds(child) for child in node.children]) if node.children else name


class Panel(hm.Template):
    def build(self, data, *, title=None):
        with hm.Data(data):
            with hm.Plot(title=title) as self.plot:
                hm.Frame()
                hm.slot()
                self.legend = hm.Legend()


@hm.template
def panel(data, *, title=None):
    """A Data scope and a Plot; children go inside the Plot."""
    with hm.Data(data):
        with hm.Plot(title=title):
            hm.slot()


@hm.template
def lollipop(x, y):
    """Two sibling marks and no slot."""
    hm.charts.ErrorBars(x=x, y=y, lower=0, upper=y)
    hm.Points(x=x, y=y)


def test_children_take_the_slot_position():
    with hm.Scene() as scene:
        with Panel(DATA, title="A") as p:
            hm.Points(x="a", y="b")
    assert kinds(p) == ("Panel", [("Data", [("Plot", ["Frame", ("Slot", ["Points"]), "Legend"])])])
    state, _ = scene._snapshot()
    assert [node["kind"] for node in flatten(state["root"])] == [
        "Scene", "Template", "Data", "Plot", "Frame", "Slot", "Points", "Legend"]
    assert state["root"]["children"][0]["props"] == {"contract": {"kind": "Panel"}}
    assert p.plot.props["title"] == "A" and p.legend.kind == "Legend"


def test_later_add_and_a_second_with_land_in_the_slot():
    with hm.Scene():
        p = Panel(DATA)
        with p:
            first = hm.Points(x="a", y="b")
        assert p.add(hm.Line(x="a", y="b")) is p
        with p:
            hm.Text(x="a", y="b", text="a")
    assert [child.kind for child in p.slot.children] == ["Points", "Line", "Text"]
    assert first.parent is p.slot
    assert p.children[0].kind == "Data"


def test_adding_a_slot_child_again_moves_it_to_the_slot_end():
    with hm.Scene():
        with Panel(DATA) as p:
            points = hm.Points(x="a", y="b")
            hm.Line(x="a", y="b")
            p.add(points)
    assert [child.kind for child in p.slot.children] == ["Line", "Points"]
    with pytest.raises(ValueError, match="already belongs to the slot of a Panel.*Remove it from that Panel"):
        hm.Plot().add(points)


def test_positional_children_inside_the_with_move_into_their_parent():
    with hm.Scene():
        with Panel(DATA) as p:
            mapping = hm.Mapping(hm.Points(), x="a", y="b")
    assert [child.kind for child in p.slot.children] == ["Mapping"]
    assert mapping.children[0].kind == "Points"


def test_clear_and_remove_act_on_the_slot():
    with hm.Scene():
        with Panel(DATA) as p:
            points = hm.Points(x="a", y="b")
            hm.Line(x="a", y="b")
        assert p.remove(points) is points and points.parent is None
        p.clear()
        with p:
            hm.Text(x="a", y="b", text="a")
    assert [child.kind for child in p.slot.children] == ["Text"]
    assert kinds(p.plot) == ("Plot", ["Frame", ("Slot", ["Text"]), "Legend"])


def test_a_template_is_a_node_its_parent_can_move_and_remove():
    with hm.Scene() as scene:
        first = panel(DATA)
        row = hm.Row(first, panel(DATA, title="second"))
    assert first.parent is row and [type(child).__name__ for child in row.children] == ["panel", "panel"]
    assert isinstance(first, panel) and isinstance(first, hm.Template) and isinstance(first, hm.Node)
    with scene:
        row.remove(first)
    assert first.parent is None and len(row.children) == 1


def test_decorator_keeps_the_functions_name_signature_and_docstring():
    assert panel.__name__ == "panel" and panel.__doc__.startswith("A Data scope")
    assert str(inspect.signature(panel)) == "(data, *, title=None)"
    assert repr(panel(DATA)).startswith("<panel template ")


def test_several_top_level_nodes_without_a_slot():
    with hm.Scene():
        with hm.Plot(data=DATA):
            stem = lollipop("a", "b")
            with pytest.raises(TypeError, match=r"lollipop has no slot, so it takes no children \(with\); call hm.slot\(\)"):
                with stem:
                    pass
            with pytest.raises(TypeError, match=r"lollipop has no slot, so it takes no children \(add\)"):
                stem.add(hm.Line(x="a", y="b"))
    assert [child.kind for child in stem.children] == ["ErrorBars", "Points"]
    assert stem.clear() is stem and len(stem.children) == 2


def test_drawn_calls_use_the_single_top_level_node():
    with hm.Scene():
        with hm.Plot(data=DATA):
            single = hm.template(lambda: hm.Points(x="a", y="b"))()
            legend = hm.Legend(target=single)
            callback = single.on_click(lambda event: None)
    points = single.children[0]
    assert legend.props["for"] is points
    assert "click" in points._callbacks and callback is points._callbacks["click"][0]
    assert single.selection is points.selection
    assert single.endpoint().node is points
    assert hm.connect(single, points, key="a").endpoints[0].node is points


def test_drawn_calls_raise_with_several_marks_and_no_main():
    with hm.Scene():
        with hm.Plot(data=DATA):
            stem = lollipop("a", "b")
            with pytest.raises(ValueError, match=r"Legend.target: the lollipop template has 2 marks \(ErrorBars, Points\) and no main part.*template.part\(...\).*hm.contract\(main=...\)"):
                hm.Legend(target=stem)
            with pytest.raises(ValueError, match=r"on_event\('click'\): the lollipop template has 2 marks"):
                stem.on_click(lambda event: None)
            with pytest.raises(ValueError, match=r"selection: the lollipop template"):
                stem.selection
            with pytest.raises(ValueError, match=r"hm.connect: the lollipop template"):
                hm.connect(stem, key="a")
            with pytest.raises(ValueError, match=r"export_png: the lollipop template has 2 top-level nodes"):
                asyncio.run(stem.export_png())


@hm.template
def pop(x, y):
    """A lollipop declaring its head main and both parts."""
    stem = hm.charts.ErrorBars(x=x, y=y, lower=0, upper=y, name="stem")
    head = hm.Points(x=x, y=y)
    hm.contract(main=head, parts={"stem": stem, "head": head})


def test_contract_main_and_parts():
    with hm.Scene():
        with hm.Plot(data=DATA):
            a = pop("a", "b")
            legend = hm.Legend(target=a)
            a.on_click(lambda event: None)
    stem, head = a.children
    assert legend.props["for"] is head and "click" in head._callbacks
    assert a.endpoint().node is head and hm.connect(a, head, key="a").endpoints[0].node is head
    assert a.part("stem") is stem and a.part("head") is head
    with pytest.raises(ValueError, match=r"pop: 'tail' must be a part \(its parts: 'stem', 'head'\) or the name of exactly one component; found 0"):
        a.part("tail")


def test_the_only_mark_is_main_below_containers_and_beside_the_slot():
    @hm.template
    def ecdf(x):
        with hm.Mapping(x=x):
            hm.Line(y="b")
            hm.Anchor(x=0, y=0)
        hm.slot()

    @hm.template
    def wrapped(x):
        with hm.Mapping(x=x):
            pop(x, "b")
            hm.slot()

    with hm.Scene():
        with hm.Plot(data=DATA):
            with ecdf("a") as single:
                hm.Points(x="a", y="b")  # the caller's: not a part
            outer = wrapped("a")
            legend = hm.Legend(target=single)
    line = single.children[0].children[0]
    assert single.selection is line.selection and legend.props["for"] is line
    # A nested template that declares a main part counts as that one mark.
    assert outer.endpoint().node is outer.children[0].children[0].children[1]


def test_contract_errors():
    with pytest.raises(RuntimeError, match=r"hm.contract\(\) declares a template's main part and parts; call it inside"):
        hm.contract()

    @hm.template
    def twice():
        hm.contract()
        hm.contract()

    @hm.template
    def framed():
        with hm.Plot() as plot:
            hm.contract(main=plot)

    @hm.template
    def borrowed(other):
        hm.Points(x="a", y="b")
        hm.contract(parts={"other": other})

    with pytest.raises(RuntimeError, match=r"twice already called hm.contract\(\)"):
        twice()
    with pytest.raises(TypeError, match=r"hm.contract\(main=...\) takes one of framed's marks or nested templates, not Plot"):
        framed()
    with hm.Plot(data=DATA):
        with pytest.raises(ValueError, match=r"borrowed: hm.contract\(parts\['other'\]=...\) names a Points that build\(\) did not create"):
            borrowed(hm.Points(x="a", y="b"))


def test_export_targets():
    with hm.Scene():
        p = Panel(DATA)
        with hm.Plot():
            single = hm.template(lambda: hm.Points(x="a", y="b", data=DATA))()
    # The browser's HTML export keeps any node's subtree, so a template exports itself; the
    # other exports go through the single top-level node (a mark with its own data exports
    # its Plot, as it does outside a template).
    assert p._export_target("export_html") == p.id
    assert p._export_target("export_png") == p.children[0].id
    assert single._export_target("export_png") == single.parent.id


def test_update_rebuilds_in_place_keeping_components_and_the_caller_s_children():
    with hm.Scene() as scene:
        p = Panel(DATA, title="A")
        with p:
            dots = hm.Points(x="a", y="b")
        plot, frame = p.plot, p.plot.children[0]
        frame.on_event("click", lambda event: None)
        assert p.update(title="B") is p
    # The same Plot with the new title, its Frame's click kept, the caller's Points in the slot.
    assert p.plot is plot and plot.props["title"] == "B" and plot.parent.parent is p
    assert list(frame._callbacks) == ["click"] and dots.parent is p.slot and p.slot.parent is plot
    assert {node.id for node in scene._nodes()} >= {plot.id, dots.id}
    with p, pytest.raises(TypeError, match=r"Panel.update: its with block is open"):
        p.update(title="C")

    # Positional parameters change by name, part dicts and other keywords keep reaching their
    # parts, nested templates rebuild, a connection to a part survives, callbacks build()
    # registers are not doubled, and a failed build leaves the template as it was (inside an
    # open block too).
    @hm.template
    def chart(x, y):
        pop(x, y).part("head").on_click(lambda event: None)
        hm.Line(x=x, y=y)

    @hm.template
    def fragile(x, fail=False):
        hm.Points(x=x, y=x)
        if fail:
            raise ValueError("boom")
        hm.Line(x=x, y=x)

    with hm.Scene(), hm.Plot(data=DATA):
        a = pop("a", "b", color="red", stem={"opacity": 0.3})
        head = a.part("head")
        other = hm.Points(x="b", y="a")
        link = hm.Line(connections=hm.connect(a, other))
        a.update(y="a")
        c = chart("a", "b")
        c.update(y="a")
        c.update(y="b")
        f = fragile("a")
        with pytest.raises(ValueError, match="boom"):
            f.update(fail=True)
        assert [child.kind for child in f.children] == ["Points", "Line"] and f._build_call[:2] == (("a",), {})
    assert a.part("head") is head and [head.props["y"], head.props["color"]] == ["a", "red"]
    assert a.part("stem").props["opacity"] == 0.3 and link.parent is not None
    assert len(c.children[0].part("head")._callbacks["click"]) == 1


def test_slot_errors():
    with pytest.raises(RuntimeError, match=r"hm.slot\(\) marks where a template's children go; call it inside"):
        hm.slot()

    class Twice(hm.Template):
        def build(self):
            with hm.Plot():
                hm.slot()
                hm.slot()

    with pytest.raises(RuntimeError, match=r"Twice already has a slot"):
        Twice()

    outside = hm.Row()

    class Elsewhere(hm.Template):
        def build(self):
            hm.Column()
            with outside:
                hm.slot()

    with pytest.raises(ValueError, match=r"Elsewhere: hm.slot\(\) was called in a context outside"):
        Elsewhere()


def test_build_errors():
    with pytest.raises(NotImplementedError, match=r"Template defines no build\(\)"):
        hm.Template()

    class Yields(hm.Template):
        def build(self):
            with hm.Plot():
                yield

    with pytest.raises(TypeError, match=r"Yields.build\(\) is a generator; mark where children go with hm.slot\(\)"):
        Yields()

    with pytest.raises(TypeError, match=r"@hm.template function 'generated' uses yield"):
        @hm.template
        def generated():
            yield

    with pytest.raises(TypeError, match=r"@hm.template decorates a function"):
        hm.template(Panel)


def test_a_failed_build_rolls_back():
    class Broken(hm.Template):
        def build(self):
            with hm.Plot():
                hm.Points(x="a", y="b")
                raise KeyError("boom")

    row = hm.Row()
    with pytest.raises(KeyError):
        with row:
            Broken()
    assert row.children == []


def test_slot_placed_by_a_helper_and_nested_templates():
    def fill(title):
        with hm.Plot(title=title):
            hm.slot()

    @hm.template
    def helped():
        fill("helper")

    @hm.template
    def outer(data):
        with panel(data):
            hm.Frame()
            hm.slot()

    with hm.Scene():
        with helped() as h:
            hm.Points(position=[[0, 0]])
        with outer(DATA) as o:
            hm.Points(x="a", y="b")
    assert kinds(h) == ("helped", [("Plot", [("Slot", ["Points"])])])
    inner = o.children[0]
    assert isinstance(inner, panel) and o.slot.parent is inner.slot
    assert kinds(o) == ("outer", [("panel", [("Data", [("Plot", [("Slot", ["Frame", ("Slot", ["Points"])])])])])])


def test_templates_validate_inside_layout_facet_partition_and_graph_scopes():
    edges = {"source": ["a", "a"], "target": ["b", "c"]}

    @hm.template
    def points():
        with hm.Mapping(x="a", y="b"):
            hm.slot()

    with hm.Scene() as scene:
        with hm.Row():
            with panel(DATA):
                hm.Points(x="a", y="b")
        with hm.Data({"a": [1.0, 2.0], "b": [3.0, 4.0], "g": ["x", "y"]}):
            with hm.Facet(column="g"):
                with hm.Plot():
                    with points():
                        hm.Points()
            with hm.Plot():
                with hm.Partition(by="g"):
                    with points():
                        hm.Points()
        with hm.Data(edges):
            with hm.GraphData(source="source", target="target"):
                with hm.Force():
                    with hm.Plot():
                        with hm.template(lambda: hm.slot())() as edge_layer:
                            with hm.Edges():
                                hm.Segments(start="start", end="end")
                        with hm.Nodes():
                            with points():
                                hm.Points(position="position")
    scene._validate()
    assert edge_layer.slot.children[0].kind == "Edges"


def test_a_mark_in_a_template_still_needs_a_plot():
    with pytest.raises(ValueError, match=r"Points must be inside a Plot"):
        with hm.Scene():
            with panel(DATA):
                pass
            with hm.template(lambda: hm.slot())():
                hm.Points(x="a", y="b")


def test_registry_marks_template_and_slot_as_passthrough_containers():
    for kind in ("Template", "Slot"):
        assert REGISTRY["components"][kind] == {"container": True, "passthrough": True, "group": "Plot and layout", "properties": [], "languages": "python"}
    assert not hasattr(hm, "Slot") and isinstance(Panel(DATA).slot, Slot)


def test_portable_template_round_trip_keeps_slot_and_independent_instances(tmp_path):
    @hm.template
    def trend(x, y, color="steelblue"):
        hm.Line(x=x, y=y, color=color, name="series")
        hm.slot()

    path = tmp_path / "trend.hmplot.json"
    trend(hm.template_param("x"), hm.template_param("y"),
          hm.template_param("color", default="steelblue")).export_template(path)
    definition = json.loads(path.read_text())
    assert definition["root"]["kind"] == "Template"
    assert definition["template"]["parameters"] == {
        "x": {}, "y": {}, "color": {"default": "steelblue"}}
    loaded = hm.load_template(path)
    assert str(inspect.signature(loaded)) == "(*, x, y, color='steelblue')"
    with hm.Scene() as scene:
        with hm.Plot(data={"day": [0, 1], "first": [1, 2], "second": [2, 3]}):
            with loaded(x="day", y="first") as a:
                hm.Points(x="day", y="first")
            b = loaded(x="day", y="second", color="tomato")
    assert a.part("series").props["color"] == "steelblue"
    assert b.part("series").props["y"] == "second"
    assert a.part("series").id != b.part("series").id
    assert [node.kind for node in a.slot.children] == ["Points"]
    assert isinstance(a.slot, Slot)
    scene._validate()

def test_gallery_portable_templates_load_with_host_data_and_independent_slots():
    from pathlib import Path
    examples = Path(__file__).resolve().parents[2] / "src" / "examples"
    for name, file in (("candlestick", "candlestick"), ("parallel", "parallel"), ("ridgeline", "ridgeline"), ("radar", "radar")):
        folder = examples / f"template-{name}"
        pattern = hm.load_template(folder / f"{file}.hmplot.json")
        data = json.loads((folder / "data.json").read_text())
        params = {"fields": ["speed", "range", "comfort", "efficiency"]} if name == "parallel" else {}
        with hm.Plot(data=data) as plot:
            a, b = pattern(**params), pattern(**params)
        assert a.id != b.id and a.slot.id != b.slot.id
        assert a.slot.children == []
        plot._scene()._validate()

def test_shift_serializes_inside_a_portable_template(tmp_path):
    @hm.template
    def shifted(interval):
        with hm.Shift(field="day", interval=interval, as_={"shifted": "later"}):
            hm.Line(x="later", y="value")
    path = tmp_path / "shift.hmplot.json"
    shifted(hm.template_param("interval")).export_template(path)
    with hm.Plot(data={"day": [0, 1], "value": [2, 3]}) as plot:
        instance = hm.load_template(path)(interval="1 year")
    assert instance.children[0].kind == "Shift"
    assert instance.children[0].props["interval"] == "1 year"
    plot._scene()._validate()


def test_portable_nested_calculate_simulate_and_data_parameter(tmp_path):
    @hm.template
    def inner(step):
        with hm.Calculate(columns={"speed": step * hm.col.value}):
            hm.slot()

    @hm.template
    def outer(data, step):
        with hm.Data(data):
            with inner(step):
                with hm.Plot():
                    with hm.Simulate(initial={"position": 0},
                                     update={"position": hm.prev.position + step}, max_steps=2):
                        hm.Line(x="position", y="speed")
                        hm.slot()

    path = tmp_path / "nested.hmplot.json"
    outer(hm.template_param("data"), hm.template_param("step")).export_template(path)
    loaded = hm.load_template(path)
    with hm.Scene() as scene:
        with loaded(data={"value": [1, 2]}, step=0.5) as instance:
            hm.Points(x="position", y="speed")
    kinds = [node["kind"] for node in flatten(scene._snapshot()[0]["root"])]
    assert kinds.count("Template") == 2
    assert isinstance(instance.children[0].children[0], hm.Template)
    assert "Calculate" in kinds and "Simulate" in kinds and "Data" in kinds
    assert instance.slot.children[0].kind == "Points"


def test_portable_template_rejects_unsafe_files_and_missing_parameters(tmp_path):
    @hm.template
    def trend(x):
        hm.Line(x=x, y="value")

    path = tmp_path / "trend.hmplot.json"
    trend(hm.template_param("x")).export_template(path)
    with pytest.raises(TypeError, match="missing parameters"):
        hm.load_template(path)()
    original = json.loads(path.read_text())
    for mutation, message in (
        (lambda file: file["root"]["children"][0].update(events=["click"]), "empty events"),
        (lambda file: file["root"]["children"][0]["props"].update(x={"$column": "a"}), "embedded resource"),
        (lambda file: file["root"]["children"][0]["props"].update(x="https://example.org/data"), "external URLs"),
        (lambda file: file["root"]["children"][0].update(kind="Provider"), "not allowed"),
    ):
        candidate = json.loads(json.dumps(original))
        mutation(candidate)
        path.write_text(json.dumps(candidate))
        with pytest.raises(ValueError, match=message):
            hm.load_template(path)


def test_visualize_tree_names_templates_by_class():
    with hm.Scene():
        with Panel(DATA) as p:
            hm.Points(x="a", y="b")
    plot = visualize_tree(p)
    columns = plot.parent.parent.parent.props["value"].columns
    assert {"Panel (template)", "Data", "Plot", "Slot", "Points"} <= set(columns["name"].categories)
    # The tooltip gives a template's class.
    assert columns["class"].categories == ("Panel",)


def test_the_two_patterns_that_work_today_still_do():
    @contextmanager
    def managed(data):
        with hm.Data(data):
            with hm.Plot():
                hm.Frame()
                yield
                hm.Legend()

    def inner_plot(data):
        with hm.Data(data):
            with hm.Plot() as plot:
                hm.Frame()
        return plot

    with hm.Scene() as scene:
        with managed(DATA):
            hm.Points(x="a", y="b")
        with inner_plot(DATA) as plot:
            hm.Points(x="a", y="b")
        plot.add(hm.Line(x="a", y="b"))
    first, second = scene.children
    assert kinds(first) == ("Data", [("Plot", ["Frame", "Points", "Legend"])])
    assert kinds(second) == ("Data", [("Plot", ["Frame", "Points", "Line"])])


def test_plot_rooted_templates_keep_plot_events_slot_endpoints_and_plot_references():
    @hm.template
    def chart(x, y):
        with hm.Plot():
            pop(x, y)
            hm.slot()

    @hm.template
    def controlled(x, y):
        hm.Slider(name="k", min=0, max=1)
        with hm.Plot():
            hm.Points(x=x, y=y)

    with hm.Scene():
        with hm.Data(DATA):
            c = chart("a", "b")
            with c:
                points = hm.Points(x="a", y="b")
            k = controlled("a", "b")
        with hm.Plot(data=DATA):
            wrapped = hm.template(lambda: pop("a", "b"))()
        c.on_event("camerachange", lambda event: None)
        legend = hm.Legend(target=c)
        assert hm.Legend(target=wrapped).props["for"] is wrapped.children[0].children[1]
        with pytest.raises(ValueError, match=r"Minimap.target: the controlled template has 2 top-level nodes"):
            hm.Minimap(target=k)
    plot = c.children[0]
    assert "camerachange" in plot._callbacks and legend.props["for"] is plot
    assert hm.Endpoint(node=c.slot).node is points


def test_loaded_template_with_a_keyword_parameter_keeps_keyword_arguments(tmp_path):
    @hm.template
    def ranged(start):
        hm.Line(x=start, y="b")

    path = tmp_path / "ranged.hmplot.json"
    ranged(hm.template_param("from")).export_template(path)
    with hm.Plot(data=DATA):
        assert hm.load_template(path)(**{"from": "a"}).children[0].props["x"] == "a"


def test_props_build_does_not_take_go_to_the_main_part():
    @hm.template
    def outer(x):
        with hm.Mapping(x=x):
            pop(x, "b")

    with hm.Plot(data=DATA):
        a = pop("a", "b", color="tomato", opacity=0.5)
        nested = outer("a", color="navy")
        with pytest.raises(TypeError, match=r"lollipop\(color=\): build\(\) takes x, y, and lollipop has 2 marks"):
            lollipop("a", "b", color="red")
        hidden = lollipop("a", "b", visible=False)
        with pytest.raises(TypeError, match=r"pop\(colour=\): Points: unknown property 'colour'. Did you mean 'color'"):
            pop("a", "b", colour="red")
    assert a.children[1].props["color"] == "tomato" and a.children[1].props["opacity"] == 0.5
    assert "color" not in a.children[0].props
    assert [mark.props["visible"] for mark in hidden.children] == [False, False]
    assert nested.children[0].children[0].children[1].props["color"] == "navy"
    with pytest.raises(TypeError, match=r"Panel\(size=\): build\(\) takes data, title, and Panel has no mark"):
        Panel(DATA, size=3)
    assert str(inspect.signature(Panel)) == "(data, *, title=None)"


def test_forwarding_edges_and_a_failed_template_leaving_its_parent():
    class Dot(hm.Template):
        def build(self):
            hm.Points(x="a", y="b")

    @hm.template
    def pair(x):
        pop(x, "b")
        pop(x, "b")

    class SubPop(pop):
        pass

    with hm.Plot(data=DATA) as plot:
        assert Dot(color="red").children[0].props["color"] == "red"
        assert SubPop("a", "b", color="red").children[1].props["color"] == "red"
        hidden = pair("a", visible=False)
        with pytest.raises(TypeError, match=r"pair\(opacity=\): build\(\) takes x, and pair has 2 marks \(pop, pop\) and no main part, so it takes only visible="):
            pair("a", opacity=0.2)
        with pytest.raises(TypeError, match=r"pop\(titel=\): Points: unknown property 'titel'.*build\(\) takes x, y"):
            pop("a", "b", titel="x")
    # Each nested lollipop's head is hidden; its stem follows the head, so it carries no visible.
    assert all(pop_.children[1].props["visible"] is False and "visible" not in pop_.children[0].props
               for pop_ in hidden.children)
    assert [type(child).__name__ for child in plot.children] == ["Dot", "SubPop", "pair"]


def test_portable_contract_round_trips_main_parts_and_forwarded_props(tmp_path):
    @hm.template
    def stem(x, y):
        with hm.Mapping(x=x, y=y):
            inner = pop(x, y)
        hm.contract(main=inner, parts={"stem": inner.part("stem")})

    path = tmp_path / "stem.hmplot.json"
    original = stem(hm.template_param("x"), hm.template_param("y"))
    original.export_template(path)
    head, line = original.children[0].children[0].children[1], original.children[0].children[0].children[0]
    assert json.loads(path.read_text())["template"]["contract"] == {"main": head.id, "parts": {"stem": line.id}}
    loaded = hm.load_template(path)
    with hm.Plot(data=DATA):
        a = loaded(x="a", y="b", color="tomato")
        legend = hm.Legend(target=a)
    pattern = a.children[0].children[0]
    assert legend.props["for"] is pattern.children[1] and pattern.children[1].props["color"] == "tomato"
    assert a.part("stem") is pattern.children[0]
    original_file = path.read_text()
    for contract in ({"main": "missing"}, {"main": [head.id]}, {"main": original.children[0].id},
                     {"parts": {"root": original.id}}, None):
        file = json.loads(original_file)
        file["template"]["contract"] = contract
        path.write_text(json.dumps(file))
        with pytest.raises(ValueError, match=r"contract must be \{main, parts\}: main the id of one of the template's marks"):
            hm.load_template(path)

    # A main part that comes from a nested template's contract is written too.
    @hm.template
    def wrap(x, y):
        with hm.Mapping(x=x, y=y):
            pop(x, y)

    wrap(hm.template_param("x"), hm.template_param("from")).export_template(path)
    with hm.Plot(data=DATA):
        b = hm.load_template(path)(x="a", **{"from": "b"}, color="red")
    assert b.children[0].children[0].children[1].props["color"] == "red"


def test_a_main_part_leaves_the_other_marks_out_of_the_legend_and_tells_the_browser(tmp_path):
    @hm.template
    def labelled(x, y):
        stem = hm.charts.ErrorBars(x=x, y=y, lower=0, upper=y, legend=True)
        head = hm.Points(x=x, y=y)
        hm.Line(x=x, y=y)
        hm.charts.Crosshair()  # no legend to leave out
        hm.contract(main=head)

    @hm.template
    def anchored(x, y):
        hm.Points(x=x, y=y)
        hm.contract(main=hm.Anchor(x=1, y=1))

    with hm.Scene() as scene:
        with hm.Plot(data=DATA):
            a = pop("a", "b")
            b = labelled("a", "b")
            group = lollipop("a", "b")
            pinned = anchored("a", "b")
    stem, head = a.children
    assert stem.props["legend"] is False and "legend" not in head.props
    assert b.children[0].props["legend"] is True and b.children[2].props["legend"] is False
    templates = {node["id"]: node for node in flatten(scene._snapshot()[0]["root"]) if node["kind"] == "Template"}
    # The browser hears the kind (its settings group's label), the main part, and the named
    # marks without a name= (the stem has one).
    assert templates[a.id]["props"] == {"contract": {"kind": "pop", "main": head.id, "parts": {"head": head.id}}}
    assert templates[group.id]["props"] == {"contract": {"kind": "lollipop"}}
    assert "legend" not in pinned.children[0].props and templates[pinned.id]["props"] == {"contract": {"kind": "anchored"}}
    assert a.props == {}
    path = tmp_path / "pop.hmplot.json"
    pop(hm.template_param("x"), hm.template_param("y")).export_template(path)
    assert json.loads(path.read_text())["root"]["props"] == {}


def test_declared_legend_entries_give_a_group_one_entry_per_listed_marks(tmp_path):
    @hm.template
    def dumbbell(x, y, note=None):
        start = hm.Points(x=x, y=y)
        end = hm.Points(x=y, y=x)
        bar = hm.Segments(start=x, end=y)
        hm.Text(x=x, y=y, text=x)
        hm.contract(legend_entries=[{"label": "Change", "swatch": end, "parts": [start, end, bar]}])

    with hm.Scene() as scene:
        with hm.Plot(data=DATA):
            group = dumbbell("a", "b")
    start, end, bar, text = group.children
    assert end.props["label"] == "Change" and "legend" not in end.props and "legend" not in text.props
    assert start.props["legend"] is False and bar.props["legend"] is False
    templates = {node["id"]: node for node in flatten(scene._snapshot()[0]["root"]) if node["kind"] == "Template"}
    assert templates[group.id]["props"] == {"contract": {"kind": "dumbbell", "legendEntries": [
        {"swatch": end.id, "parts": [start.id, end.id, bar.id]}]}}

    path = tmp_path / "dumbbell.hmplot.json"
    dumbbell(hm.template_param("x"), hm.template_param("y")).export_template(path)
    file = json.loads(path.read_text())
    [entry] = file["template"]["contract"]["legendEntries"]
    nodes = file["root"]["children"]
    assert entry == {"swatch": nodes[1]["id"], "parts": [node["id"] for node in nodes[:3]]}
    with hm.Scene() as loaded_scene:
        with hm.Plot(data=DATA):
            loaded = hm.load_template(path)(x="a", y="b")
    templates = {node["id"]: node for node in flatten(loaded_scene._snapshot()[0]["root"]) if node["kind"] == "Template"}
    assert templates[loaded.id]["props"]["contract"]["legendEntries"][0]["swatch"] == loaded.children[1].id
    for broken in ({**entry, "swatch": nodes[3]["id"]}, {"swatch": entry["swatch"], "parts": entry["parts"], "label": "x"}):
        file["template"]["contract"]["legendEntries"] = [broken]
        path.write_text(json.dumps(file))
        with pytest.raises(ValueError, match="legendEntries must be"):
            hm.load_template(path)


def test_legend_entries_are_checked_where_they_are_declared():
    def build(entries, main=False):
        @hm.template
        def pair(x, y):
            a = hm.Points(x=x, y=y)
            b = hm.Line(x=x, y=y)
            hm.contract(main=a if main else None, legend_entries=entries(a, b))

        pair("a", "b")

    with hm.Scene(), hm.Plot(data=DATA):
        stray = hm.Points(x="a", y="b")
        with pytest.raises(ValueError, match="needs a template with no main part"):
            build(lambda a, b: [{"parts": [a, b]}], main=True)
        with pytest.raises(ValueError, match="build\\(\\) did not create"):
            build(lambda a, b: [{"parts": [a, stray]}])
        with pytest.raises(ValueError, match="more than once"):
            build(lambda a, b: [{"parts": [a, b]}, {"parts": [b]}])
        with pytest.raises(ValueError, match="must be one of its parts"):
            build(lambda a, b: [{"swatch": b, "parts": [a]}])
        with pytest.raises(TypeError, match="takes a list of"):
            build(lambda a, b: [{"swatches": a}])


def test_an_outer_entry_sees_a_nested_group_by_its_leaders_and_visible_spares_followers():
    @hm.template
    def dumbbell(x, y):
        start = hm.Points(x=x, y=y)
        end = hm.Points(x=y, y=x)
        hm.contract(legend_entries=[{"label": "Change", "swatch": end, "parts": [start, end]}])

    @hm.template
    def both(x, y):
        inner = dumbbell(x, y)
        line = hm.Line(x=x, y=y)
        hm.contract(legend_entries=[{"label": "Both", "parts": [inner, line]}])

    with hm.Scene(), hm.Plot(data=DATA):
        outer = both("a", "b", visible=False)
        start, end = outer.children[0].children
        line = outer.children[1]
        # The nested group stands for its swatch: it leads the outer entry and takes its label.
        assert end.props["label"] == "Both" and "legend" not in end.props and line.props["legend"] is False
        assert [end.props["visible"], "visible" in start.props, "visible" in line.props] == [False, False, False]

        @hm.template
        def stray(x, y):
            inner = dumbbell(x, y)
            hm.contract(legend_entries=[{"parts": [inner.children[0]]}])

        with pytest.raises(ValueError, match="follows another mark of a nested template"):
            stray("a", "b")


def test_a_part_keyword_takes_that_part_s_props(tmp_path):
    @hm.template
    def pair(x, y):
        a = hm.Points(x=x, y=y)
        b = hm.Line(x=x, y=y)
        hm.contract(parts={"dots": a, "trace": b})

    with hm.Scene(), hm.Plot(data=DATA):
        a = pop("a", "b", stem={"color": "gray"}, opacity=0.5)
        stem, head = a.children
        assert stem.props["color"] == "gray" and head.props["opacity"] == 0.5 and "opacity" not in stem.props
        # A group takes its parts' dicts beside visible=.
        group = pair("a", "b", trace={"width": 3}, visible=False)
        assert group.children[1].props["width"] == 3 and group.children[0].props["visible"] is False
        with pytest.raises(TypeError, match=r"pop\(stem=...\): stem is a part of pop, so stem= takes a dict"):
            pop("a", "b", stem="gray")
        with pytest.raises(TypeError, match=r"pop\(stem=...\): ErrorBars: unknown property 'colour'"):
            pop("a", "b", stem={"colour": "gray"})

        @hm.template
        def clash(x, y):
            dot = hm.Points(x=x, y=y)
            hm.contract(main=dot, parts={"fill": dot})

        @hm.template
        def shadow(x, y):
            hm.contract(parts={"x": hm.Points(x=x, y=y)})

        with pytest.raises(ValueError, match=r"names a part 'fill', which is a Points prop of the main part"):
            clash("a", "b")
        with pytest.raises(ValueError, match=r"names a part 'x', which is a build\(\) parameter"):
            shadow("a", "b")

    path = tmp_path / "pop.hmplot.json"
    pop(hm.template_param("x"), hm.template_param("y")).export_template(path)
    with hm.Scene(), hm.Plot(data=DATA):
        loaded = hm.load_template(path)(x="a", y="b", stem={"color": "gray"})
    assert loaded.part("stem").props["color"] == "gray"


def test_a_nested_template_s_only_mark_leads_as_the_outer_main_part():
    @hm.template
    def dots(x, y):
        hm.Points(x=x, y=y)

    @hm.template
    def outer(x, y):
        inner = dots(x, y)
        hm.Line(x=x, y=y, color="blue")
        hm.contract(main=inner)

    with hm.Scene() as scene, hm.Plot(data=DATA):
        o = outer("a", "b", visible=False)
    [points], line = o.children[0].children, o.children[1]
    # The line follows the points (no authored visible of its own) and leaves the legend.
    assert points.props["visible"] is False and "visible" not in line.props and line.props["legend"] is False
    templates = {node["id"]: node for node in flatten(scene._snapshot()[0]["root"]) if node["kind"] == "Template"}
    assert templates[o.id]["props"]["contract"]["main"] == points.id


def test_a_part_dict_wins_and_part_names_are_checked_against_an_implicit_main():
    @hm.template
    def dots(x, y):
        hm.Points(x=x, y=y)

    with hm.Scene(), hm.Plot(data=DATA):
        a = pop("a", "b", head={"color": "red"}, color="blue")
        assert a.children[1].props["color"] == "red"

        @hm.template
        def lone(x, y):
            dot = hm.Points(x=x, y=y)
            hm.contract(parts={"opacity": dot})

        @hm.template
        def layered(x, y):
            inner = dots(x, y)
            line = hm.Line(x=x, y=y)
            hm.contract(main=inner, parts={"color": line})

        for build in (lone, layered):
            with pytest.raises(ValueError, match=r"which is a Points prop of the main part"):
                build("a", "b")


def test_nested_contracts_round_trip_through_a_portable_file(tmp_path):
    @hm.template
    def chart(x, y):
        inner = pop(x, y)
        hm.Line(x=x, y=y)
        hm.contract(parts={"lolly": inner}, legend_entries=[{"label": "Trend"}])

    path = tmp_path / "chart.hmplot.json"
    chart(hm.template_param("x"), hm.template_param("y")).export_template(path)
    file = json.loads(path.read_text())
    inner = file["root"]["children"][0]
    stem, head = inner["children"]
    assert inner["props"] == {"contract": {"kind": "pop", "main": head["id"],
                                           "parts": {"stem": stem["id"], "head": head["id"]}}}
    with hm.Scene() as scene, hm.Plot(data=DATA):
        loaded = hm.load_template(path)(x="a", y="b", lolly={"color": "red"})
    nested = loaded.children[0]
    assert nested.children[1].props["color"] == "red"
    # The nested lollipop keeps its kind, main part and parts: its stem follows its head, and a
    # part dict through it reaches the part.
    assert nested._name == "pop" and nested.part("stem") is nested.children[0]
    templates = {node["id"]: node for node in flatten(scene._snapshot()[0]["root"]) if node["kind"] == "Template"}
    assert templates[nested.id]["props"]["contract"] == {"kind": "pop", "main": nested.children[1].id,
                                                         "parts": {"head": nested.children[1].id}}
    for broken in ({"kind": "pop", "main": file["root"]["children"][1]["id"]}, {"kind": "", "main": head["id"]},
                   {"color": "red"}):
        inner["props"] = {"contract": broken}
        path.write_text(json.dumps(file))
        with pytest.raises(ValueError, match=r"the nested (pop )?template .*'s contract must be"):
            hm.load_template(path)
    inner["props"] = {"contract": {}, "color": "red"}
    path.write_text(json.dumps(file))
    with pytest.raises(ValueError, match="Template takes no properties but its contract"):
        hm.load_template(path)


def test_nested_contracts_export_a_group_main_and_a_slot_inside_a_nested_slot(tmp_path):
    @hm.template
    def _band(x, y):
        hm.Line(x=x, y=y)
        hm.Points(x=x, y=y)

    @hm.template
    def wrapper(x, y):
        hm.contract(main=_band(x, y))

    @hm.template
    def framed():
        with hm.Frame():
            hm.slot()

    @hm.template
    def forward(x, y):
        # Its own slot sits inside the nested template's slot.
        with framed():
            hm.Points(x=x, y=y)
            hm.slot()

    @hm.template
    def chart(x, y):
        wrapper(x, y)
        hm.charts.ErrorBars(x=x, y=y, lower=0, upper=y)
        forward(x, y)

    path = tmp_path / "chart.hmplot.json"
    chart(hm.template_param("x"), hm.template_param("y")).export_template(path)
    file = json.loads(path.read_text())
    # A group as the main part has no one mark, so the file leaves it out.
    assert file["root"]["children"][0]["props"] == {"contract": {"kind": "wrapper"}}
    assert file["root"]["children"][0]["children"][0]["props"] == {"contract": {"kind": "_band"}}
    with hm.Scene(), hm.Plot(data=DATA):
        loaded = hm.load_template(path)(x="a", y="b")
    outer = loaded.children[2]
    inner = outer.children[0]
    assert outer.slot is not None and outer.slot.parent is inner.slot and outer.slot.template is outer


def test_marginals_is_a_figure_of_its_own_with_marks_inside():
    # TODO 136.16: Marginals sits where a Plot does, takes data= as a table, and its children are
    # marks it draws in its scatter's Plot; its other keywords go to the scatter's Points.
    with hm.Scene() as scene:
        with hm.charts.Marginals(data=DATA, x="a", y="b", bins=5, fill="steelblue") as figure:
            hm.Text(x=1, y=2, text="note", rows="auto")
    state, _ = scene._snapshot()
    node = next(n for n in flatten(state["root"]) if n["kind"] == "Marginals")
    assert node["props"]["data"] == {"$table": figure.props["data"].id}
    assert {key: node["props"][key] for key in ("x", "y", "bins", "fill")} == {"x": "a", "y": "b", "bins": 5, "fill": "steelblue"}
    assert [child["kind"] for child in node["children"]] == ["Text"]
    assert hm.charts.Marginals(data=DATA, x="a", y="b")._scene()._snapshot()[0]["root"]["children"][0]["kind"] == "Marginals"
    scene._validate()
    with pytest.raises(ValueError, match=r"Marginals\.y is required"):
        hm.charts.Marginals(data=DATA, x="a")._scene()._validate()
    with pytest.raises(ValueError, match="Marginals cannot be inside a Plot"):
        with hm.Plot(data=DATA) as plot:
            hm.charts.Marginals(x="a", y="b")
        plot._scene()._validate()
    with pytest.raises(ValueError, match="Plot cannot be inside Marginals"):
        with hm.charts.Marginals(data=DATA, x="a", y="b") as nested:
            hm.Plot()
        nested._scene()._validate()
    with pytest.raises(ValueError, match="Facet cannot be inside Marginals"):
        with hm.charts.Marginals(data=DATA, x="a", y="b") as nested:
            with hm.Facet(column="a"):
                hm.Points(x="a", y="b")
        nested._scene()._validate()
    # A Facet around a Marginals is refused alike, with or without marks in the Marginals.
    for marks in (False, True):
        with pytest.raises(ValueError, match="Marginals cannot be inside a Facet"):
            with hm.Facet(data=DATA, column="a") as facet:
                with hm.charts.Marginals(x="a", y="b"):
                    if marks:
                        hm.Text(x=1, y=2, text="note", rows="auto")
            facet._scene()._validate()
    with pytest.raises(ValueError, match="Slider 'bins' is inside Marginals"):
        with hm.charts.Marginals(data=DATA, x="a", y="b") as figure:
            hm.Slider(name="bins", min=5, max=50)
        figure._scene()._validate()
    with pytest.raises(ValueError, match="Marginals.height is the figure's height in CSS pixels, at least 160"):
        hm.charts.Marginals(data=DATA, x="a", y="b", height=100)._scene()._validate()
    # A mark with data of its own inside a Marginals exports the figure, as one in a Plot exports the Plot.
    with hm.Scene():
        with hm.charts.Marginals(data=DATA, x="a", y="b") as figure:
            label = hm.Text(data={"t": ["note"]}, x=1, y=2, text="t")
    assert label._export_target() == figure.id


def test_authoring_guide_examples_build_update_and_round_trip(tmp_path, monkeypatch):
    # Execute the guide itself: its mark, transform/layout pattern and both portable files
    # must keep their contracts and caller scopes, rather than a separate copy of the examples.
    guide = Path(__file__).resolve().parents[2] / "docs/PORTABLE-TEMPLATES.md"
    programs = re.findall(r"```python\n(.*?)```", guide.read_text(), re.S)
    assert len(programs) >= 5
    monkeypatch.chdir(tmp_path)
    ns = {"__name__": "template_authoring_docs"}
    for code in programs:
        exec(compile(code, str(guide), "exec"), ns)

    interval = ns["interval"]
    assert interval.part("head") is ns["head_before"]
    assert interval.part("head").props["y"] == "alternate"
    assert interval.part("head").props["size"] == 9
    assert len(interval.part("head")._callbacks["click"]) == 1
    assert interval.part("band").props["opacity"] == 0.1
    assert interval.slot.children == [ns["annotation"]]
    assert ns["annotation"].parent is interval.slot

    first, second = ns["first"], ns["second"]
    assert first.plot.props["title"] == "Centered observations"
    assert second.plot.props["title"] == "Other measure"
    assert first.plot is not second.plot and first.slot is not second.slot
    assert first.slot.parent is first.plot and first.plot.parent.kind == "Calculate"
    assert first._main_mark() is None  # caller marks in the slot do not become its main

    loaded, other = ns["loaded_interval"], ns["other_interval"]
    assert loaded.part("head").props["size"] == 6
    assert loaded.part("band").props["opacity"] == 0.2
    assert loaded.part("band").props["legend"] is False
    assert other.part("head").props["visible"] is False
    assert other.part("head")._callbacks == {} and other.slot.children == []
    assert len(loaded.part("head")._callbacks["click"]) == 1
    assert loaded.id != other.id and loaded.part("head").id != other.part("head").id
    assert ns["loaded_panel"].children[0].children[0].props["title"] == "Centered values"
    assert not hasattr(ns["loaded_panel"], "plot")  # attributes/methods are not serialized
    for name in ("mark_plot", "panel_scene", "portable_plot", "portable_panel"):
        scene = ns[name]._scene()
        scene._validate()
        scene._snapshot()

    file = json.loads((tmp_path / "interval-points.hmplot.json").read_text())
    assert file["template"]["parameters"]["band_opacity"] == {"default": 0.2}
    assert set(file["template"]["contract"]["parts"]) == {"band", "head"}
    assert all(node["events"] == [] for node in flatten(file["root"]))
    assert "Plot" not in [node["kind"] for node in flatten(file["root"])]
    panel_file = json.loads((tmp_path / "centered-panel.hmplot.json").read_text())
    assert [node["kind"] for node in flatten(panel_file["root"])] == ["Template", "Calculate", "Plot", "Slot"]


def test_authoring_guide_export_requires_an_empty_slot_and_callback_free_prototype(tmp_path, monkeypatch):
    guide = Path(__file__).resolve().parents[2] / "docs/PORTABLE-TEMPLATES.md"
    first_program = re.findall(r"```python\n(.*?)```", guide.read_text(), re.S)[0]
    monkeypatch.chdir(tmp_path)
    ns = {"__name__": "template_authoring_docs"}
    exec(compile(first_program, str(guide), "exec"), ns)
    with pytest.raises(ValueError, match="empty slot"):
        ns["interval"].export_template(tmp_path / "filled.hmplot.json")
    with hm.Plot(data=ns["data"]):
        prototype = ns["interval_points"]("day", "value", "low", "high")
    prototype.on_click(lambda event: None)
    with pytest.raises(ValueError, match="empty events"):
        prototype.export_template(tmp_path / "callback.hmplot.json")
    # A Python build default is fixed unless exported as a marker, whose own default decides
    # whether a loaded parameter is optional. The guide's explicit marker default matters.
    prototype = ns["interval_points"]("day", "value", "low", "high",
                                      band_opacity=hm.template_param("alpha"))
    path = prototype.export_template(tmp_path / "required.hmplot.json")
    with pytest.raises(TypeError, match="missing parameters"):
        hm.load_template(path)()


def test_low_risk_charts_keep_named_style_keys_snake_case_in_python():
    with hm.Plot(data={"value": [1, 2], "row": ["A", "B"], "low": [0, 1], "high": [2, 3]}):
        forest = hm.charts.ForestPlot(x="value", y="row", lower="low", upper="high",
                                      interval={"cap_size": 8}, reference_line={"width": 2})
        bullet = hm.charts.BulletChart(x="value", y="row", ranges={"outline_width": 1})
        timeline = hm.charts.IntervalTimeline(y="row", x0="low", x1="high",
                                              milestones={"outline_color": "black"})
        spark = hm.charts.Sparkline(x="value", y="value", last={"dx": 4, "size": 12})
    assert forest.props["interval"] == {"capSize": 8}
    assert forest.props["referenceLine"] == {"width": 2}
    assert bullet.props["ranges"] == {"outlineWidth": 1}
    assert timeline.props["milestones"] == {"outlineColor": "black"}
    assert spark.props["last"] == {"dx": 4, "size": 12}
    forest._scene()._validate()
    with pytest.raises(ValueError, match="ForestPlot.interval.*unknown key 'cap_sze'.*cap_size"):
        hm.charts.ForestPlot(x="value", y="row", lower="low", upper="high", interval={"cap_sze": 8})


def test_focus_context_is_a_figure_with_required_columns():
    # TODO 136.16 slice 2: a figure (where a Plot sits), its children marks in the focus.
    data = {"day": [0, 1, 2, 3], "visits": [3, 4, 2, 5]}
    with hm.Scene() as scene:
        with hm.charts.FocusContext(data=data, x="day", y="visits", height=300):
            hm.charts.RuleY(y=4)
    scene._validate()
    with pytest.raises(ValueError, match="FocusContext.y is required"):
        with hm.Scene() as broken:
            hm.charts.FocusContext(data=data, x="day")
        broken._validate()
    with pytest.raises(ValueError, match="cannot be inside FocusContext"):
        with hm.Scene() as nested:
            with hm.charts.FocusContext(data=data, x="day", y="visits"):
                hm.Plot()
        nested._validate()
