"""Composable GPU plots. See the bundled notebooks for the context-manager API."""

from .data import Table, typed_column, literal, animate, Animate, EASINGS, categorical, ordinal, continuous, normalization, rgb, colormap, Rgb, COLORMAP_NAMES, register_shape, BUILTIN_SHAPES, CategoryScale, OrdinalScale, ContinuousScale, NormalizationResource, ThemeResource, SelectionResource, IdentityResource, selection, observation_identity as identity, ThemePresets, create_theme, themes, load_theme
from .netcdf import stream
from .expressions import *
from .expressions import __all__ as _expression_exports
# Left out of __all__ (a star import would shadow the builtins) but still hm.min / hm.max / hm.sum
# / hm.round.
from .expressions import min, max, sum, round, any, all  # noqa: A004
# hm.input reads inputs (TODO 41); like min and max it stays out of `import *`.
from .expressions import input  # noqa: A004
# hm.bin is a Group key (TODO 137.2); like min, it stays out of `import *` (the builtin bin).
from .expressions import bin  # noqa: A004
# A Simulate's previous state (TODO 42) and view and interaction state (hm.view.time, R2.0);
# also out of `import *`.
from .expressions import prev, view, STATE_NAMES
from .core import Node, Scene, SceneError, REGISTRY, Template, template, template_param, slot, contract, Input
from .templates import load_template
from .connections import connect, Connect, Endpoint
# Channel and the option dicts' TypedDicts, for type checkers (generated; see _types.py).
from ._types import *
from .introspection import visualize_tree
from .hierarchy import linkage_table
from .exporter import ExportSession, export_png, export_pdf, export_svg, export_html, export_mp4, export_png_async, export_pdf_async, export_svg_async, export_html_async, export_mp4_async
from .checking import check, CheckResult
from .presentation import effect, shade
from .lights import light
from .plugins import use_plugin

__version__ = "0.1.0-alpha.1"
import copy as _copy
from ._components import component_class as _component_class, _PYTHON_NAMES
from .pipeline import Pipeline as _Pipeline
for _name, _spec in REGISTRY["components"].items():
    if _name not in ("Scene", "SceneError", "Template", "Slot") and _spec.get("tier") not in ("charts", "stats") and _spec.get("languages") != "js":
        globals()[_PYTHON_NAMES.get(_name, _name)] = _component_class(_name, __name__)
from . import charts, stats

def install_chrome(*, force=False, quiet=False):
    """Download Chrome for Testing into the user cache for exports, ahead of the first one (the
    `hmplot install-chrome` command). Exports use an installed Chrome, Edge or Chromium first;
    see hmplot/chrome.py. Returns the executable's path."""
    from .chrome import install_chrome as install
    return install(force=force, quiet=quiet)


class Transform(globals()["Transform"]):
    """Run a registered transform or layout; parameter keywords follow its schema."""
    def _set(self, props, *, from_browser=False):
        from .transform import transform_props
        return super()._set(transform_props(self.props, props, from_browser=from_browser),
                            from_browser=from_browser)


class Calculate(_Pipeline):
    kind = "Calculate"
    def __init__(self, *children, columns=None, **outputs):
        if columns is not None and outputs:
            raise TypeError("Calculate accepts columns={...} or keyword outputs, not both.")
        values = columns if columns is not None else outputs
        if not isinstance(values, dict) or not values:
            raise TypeError("Calculate requires at least one output expression.")
        super().__init__(*children, columns=values)
_provider_signature = globals()["Provider"].__signature__


class Provider(Node):
    """Data loaded in the browser from ``url`` (TODO 20; docs/PROVIDERS.md). ``{name}`` in the
    URL is filled from ``params``; assigning ``provider.params`` reloads it, and ``await
    provider.refresh()`` loads the same params again."""

    kind = "Provider"
    __signature__ = _provider_signature

    def __init__(self, *children, **props):
        url = props.get("url")
        if not isinstance(url, str) or not url:
            raise TypeError("Provider requires url=... (a URL with {name} placeholders filled from params).")
        super().__init__(*children, **props)

    @property
    def params(self):
        """The params the browser loads with (a copy); assign a dict to reload."""
        return _copy.deepcopy(self.props.get("params") or {})

    @params.setter
    def params(self, value):
        self.update(params=value)

    async def refresh(self, *, view=None, timeout=60):
        """Load again with the same params; returns once the result is shown (or unchanged).
        Raises SceneError when the load fails."""
        await self.action("refresh", view=view, timeout=timeout)


__all__ = [
    "charts",
    "stats",
    "Scene",
    "SceneError",
    "Template",
    "template",
    "template_param",
    "load_template",
    "slot",
    "contract",
    "Table",
    "stream",
    "typed_column",
    "selection",
    "identity",
    "SelectionResource",
    "IdentityResource",
    "literal",
    "animate",
    "Animate",
    "tween",
    "connect",
    "Connect",
    "Endpoint",
    "categorical",
    "ordinal",
    "continuous",
    "normalization",
    "rgb",
    "colormap",
    "Rgb",
    "COLORMAP_NAMES",
    "register_shape",
    "BUILTIN_SHAPES",
    "CategoryScale",
    "OrdinalScale",
    "ContinuousScale",
    "NormalizationResource",
    "ThemeResource",
    "ThemePresets",
    "create_theme",
    "load_theme",
    "visualize_tree",
    "linkage_table",
    "themes",
    "ExportSession",
    "install_chrome",
    "export_png",
    "export_pdf",
    "export_svg",
    "export_html",
    "export_mp4",
    "export_mp4_async",
    "export_png_async",
    "export_pdf_async",
    "export_svg_async",
    "export_html_async",
    "check",
    "CheckResult",
    "light",
    "effect",
    "shade",
    "use_plugin",
    *_expression_exports,
    *[_PYTHON_NAMES.get(n, n) for n in REGISTRY["components"] if n not in ("Scene", "Template", "Slot") and REGISTRY["components"][n].get("tier") not in ("charts", "stats") and REGISTRY["components"][n].get("languages") != "js"],
]


# Components a release removed, with what replaces them (TODO 138.3).
_REMOVED = {
    "Ribbon": 'Use hm.Area(x=..., lower=..., upper=...), or y=... with orientation="horizontal".',
    "AmbientLight": 'Use hm.Plot(lights=[hm.light("ambient", ...)]).',
    "DirectionalLight": 'Use hm.Plot(lights=[hm.light("directional", ...)]).',
    "HemisphereLight": 'Use hm.Plot(lights=[hm.light("hemisphere", ...)]).',
    "PointLight": 'Use hm.Plot(lights=[hm.light("point", ...)]).',

    "GeoJSONLine": "Use hm.GeoJSON(fill=None, color=..., width=...).",
    "ConstantData": "Use hm.Data(rows=N), with hm.row(), hm.random() and constant values in hm.Calculate(columns={...}).",
    "Controls": "Use hm.Row(wrap=True, min_width=0) beside the plots.",
    "RangeSlider": "Use hm.Slider(value=[lower, upper], min=..., max=...).",
    "MultiSelect": "Use hm.Select(multiple=True, options=..., value=[...]).",
    "Sky": 'Sky is an effect of its Plot: hm.Plot(effects=[hm.effect("sky", zenith="#2f5f9e")]).',
    "Bloom": 'Bloom is an effect of its Plot: hm.Plot(effects=[hm.effect("bloom", strength=1.2)]).',
    # TODO 137.3: transforms that Calculate expressions, reducers, Sample and the Ecdf chart cover.
    "JoinAggregate": "A group's value on every row is a reduction with by= in Calculate: "
                     'hm.Calculate(mean_y=hm.mean("y", by="g")).',
    "ECDF": 'Draw the distribution with hm.charts.Ecdf(x="x", by="g"), or compute it in Calculate: '
            'hm.Calculate(ecdf=hm.cumsum(hm.is_finite("x"), by="g", order_by="x") / hm.count("x", by="g")), '
            'which matches it for distinct values.',
    "Quantile": 'A quantile is a reduction: hm.quantile("x", 0.9, by="g") in Calculate or in '
                'Group(columns={"p90": hm.quantile("x", 0.9)}).',
    "Shuffle": 'Sample shuffles: hm.Sample(order="random") keeps every row in a seeded random order.',
    "FromEdges": "GraphData infers the nodes from the edges: hm.GraphData() reads the surrounding data as "
                 'edges, and takes FromEdges\' node_from= and reduce= (hm.GraphData(reduce={"w": {"field": "w", "op": "sum"}})).',
}


def __getattr__(name):
    tier = REGISTRY["components"].get(name, {}).get("tier")
    if tier in ("charts", "stats"):
        raise AttributeError(f"hm.{name} moved to hm.{tier}.{name}. Use hm.{tier}.{name}(...) or from hmplot.{tier} import {name}.")
    if name in _REMOVED:
        raise AttributeError(f"hm.{name} was removed. {_REMOVED[name]}")
    raise AttributeError(f"module 'hmplot' has no attribute {name!r}")
