"""Legends (6.11): scale labels in the snapshot, and Legend / legend= validation."""
import re
from pathlib import Path

import pytest
import hmplot as hm
from hmplot.core import LEGEND_CHANNELS, LEGEND_POSITIONS

ROOT = Path(__file__).resolve().parents[2]
DATA = {"x": [0.0, 1.0, 2.0], "y": [1.0, 2.0, 3.0], "mass": [1.0, 10.0, 100.0], "group": ["a", "b", "a"]}


def test_legend_lists_match_the_javascript_lists():
    guides = (ROOT / "src/lib/plot/utils/guides.js").read_text()
    js = re.findall(r'"(\w+)"', re.search(r"LEGEND_CHANNELS = \[(.*?)\]", guides, re.S).group(1))
    assert list(LEGEND_CHANNELS) == js
    types = (ROOT / "src/lib/plot/publicTypes.ts").read_text()
    positions = re.findall(r'"(\w+)"', re.search(r"export type LegendPosition = (.*?);", types).group(1))
    assert list(LEGEND_POSITIONS) == positions == ["top", "bottom", "left", "right"]


def test_scale_labels_round_trip_through_the_snapshot():
    shared = hm.continuous(domain=[0, 100], colormap="Magma", label="Shared value")
    bands = hm.ordinal(domain=["low", "high"], label="Band")
    kinds = hm.categorical(domain=["a", "b"], label="Kind")
    plain = hm.continuous(range=[4, 20])
    with hm.Scene() as scene:
        with hm.Plot(data=DATA):
            hm.Points(x="x", y="y", fill="mass", fill_scale=shared, size="mass", size_scale=plain)
            hm.Points(x="y", y="x", fill="mass", fill_scale=shared)
            hm.Points(x="x", y="x", fill="group", fill_scale=kinds)
            hm.Points(x="y", y="y", fill="group", fill_scale=bands)
            hm.Legend(channel="fill")
    state, _ = scene._snapshot()
    scales = state["scales"]
    assert scales[shared.id]["label"] == "Shared value"
    assert scales[bands.id]["label"] == "Band" and scales[bands.id]["kind"] == "ordinal"
    assert scales[kinds.id]["label"] == "Kind" and scales[kinds.id]["kind"] == "categorical"
    assert "label" not in scales[plain.id], "no label key unless one is given"
    assert shared.label == "Shared value" and plain.label is None
    scene.close()


def test_scale_labels_must_be_strings():
    for make in (lambda: hm.continuous(label=3), lambda: hm.ordinal(domain=["a"], label=["x"]),
                 lambda: hm.categorical(label=True)):
        with pytest.raises(TypeError, match=r"Scale label must be a string; got (int|list|bool)\."):
            make()


def test_legend_channel_accepts_camel_and_snake_case_and_rejects_the_rest():
    with hm.Scene() as scene:
        with hm.Plot(data=DATA):
            points = hm.Points(x="x", y="y", outline_color="group")
            snake = hm.Legend(target=points, channel="outline_color")
            camel = hm.Legend(target=points, channel="outlineColor")
            with pytest.raises(ValueError, match=r"Legend: channel must be one of fill, color, shape, "
                                                 r"outlineColor, size, width, opacity; got 'colour'\."):
                hm.Legend(target=points, channel="colour")
    assert snake.props["channel"] == "outlineColor"
    assert camel.props["channel"] == "outlineColor"
    with pytest.raises(ValueError, match=r"Legend: channel must be one of .*; got 'outline'\."):
        snake.update(channel="outline")
    assert snake.props["channel"] == "outlineColor", "a rejected update changes nothing"
    snake.update(channel="size")
    assert snake.props["channel"] == "size"
    scene.close()


def test_legend_position_and_plot_or_facet_legend_values_are_validated():
    with hm.Scene() as scene:
        with pytest.raises(ValueError, match=r"Legend: position must be one of top, bottom, left, right; got 'middle'\."):
            hm.Legend(channel="fill", position="middle")
        with pytest.raises(ValueError, match=r'Facet: legend must be True, False, "cell", or \{"position": \.\.\.\}; got \'cells\'\.'):
            hm.Facet(data=DATA, column="group", legend="cells")
        with pytest.raises(ValueError, match=r"Facet legend: position must be one of top, bottom, left, right; got 'middle'\."):
            hm.Facet(data=DATA, column="group", legend={"position": "middle"})
        with pytest.raises(ValueError, match=r"Facet\.legend: unknown key 'side'\. Accepted keys: position\."):
            hm.Facet(data=DATA, column="group", legend={"side": "left"})
        with pytest.raises(ValueError, match=r'Plot: legend must be True, False, or \{"position": \.\.\.\}; got \'cell\'\.'):
            hm.Plot(data=DATA, legend="cell")
        with hm.Facet(data=DATA, column="group", legend="cell") as facet:
            with hm.Plot(legend={"position": "left"}):
                hm.Points(x="x", y="y", label="Points")
    assert facet.props["legend"] == "cell"
    facet.update(legend={"position": "top"})
    assert facet.props["legend"] == {"position": "top"}
    with pytest.raises(ValueError, match=r"Facet legend: position must be one of"):
        facet.update(legend={"position": "center"})
    facet.update(legend=False)
    assert facet.props["legend"] is False
    scene._validate()
    scene.close()
