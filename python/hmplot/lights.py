"""Plain light specs for Plot(lights=[...]); lights are scene settings, not nodes."""
from __future__ import annotations

import math
from numbers import Integral, Real
from typing import Literal, cast

from ._types import LightSpec
from .expressions import Expression

LightKind = Literal["ambient", "directional", "hemisphere", "point"]
_PARAMETERS = {
    "ambient": {"color", "intensity"},
    "directional": {"color", "intensity", "position"},
    "hemisphere": {"color", "groundColor", "intensity", "position"},
    "point": {"color", "intensity", "position", "distance", "decay"},
}


def light(kind: LightKind, *, color=None, intensity=None, position=None,
          ground_color=None, distance=None, decay=None) -> LightSpec:
    """A light for ``Plot(lights=[...])``. Kinds: ambient (everywhere), directional
    (toward the origin), hemisphere (sky and ground colors), point (a bulb).
    Colors default to white and intensity to 1. Position uses world coordinates:
    [0, 1, 0] for directional/hemisphere, [0, 0, 0] for point. Point lights default
    to distance=0 (unlimited) and decay=2 (inverse square); decay=0 is constant.
    Parameters may read inputs; the browser validates their resolved values.

    Example:
        import hmplot as hm

        with hm.Plot(type="3d", lights=[hm.light("ambient", intensity=2)]) as plot:
            hm.Points3D(position=[[0, 0, 0]], size=1)
        plot
    """
    values = _light_value({"kind": kind, **{key: value for key, value in {
        "color": color, "intensity": intensity, "position": position,
        "groundColor": ground_color, "distance": distance, "decay": decay,
    }.items() if value is not None}})
    return cast("LightSpec", {"ground_color" if key == "groundColor" else key: value
                              for key, value in values.items()})


def _finite(value):
    return isinstance(value, Real) and not isinstance(value, bool) and math.isfinite(value)


def _light_value(spec):
    if not isinstance(spec, dict) or not isinstance(spec.get("kind"), str) or spec["kind"] not in _PARAMETERS:
        raise ValueError('Plot.lights: pass hm.light("ambient" | "directional" | "hemisphere" | "point", ...).')
    kind = spec["kind"]
    spec = dict(spec)
    if hasattr(spec.get("position"), "tolist"):
        spec["position"] = spec["position"].tolist()
    for key, value in spec.items():
        if key == "kind":
            continue
        if key not in _PARAMETERS[kind]:
            raise ValueError(f"Plot.lights: {kind} does not take {key}; pass {', '.join(sorted(_PARAMETERS[kind]))}.")
        if isinstance(value, Expression):
            continue
        if key in ("intensity", "distance", "decay") and not (_finite(value) and value >= 0):
            raise ValueError(f"Plot.lights: {kind}.{key} must be a finite number of at least zero.")
        if key in ("color", "groundColor") and not (isinstance(value, str) and value):
            raise ValueError(f"Plot.lights: {kind}.{key} must be a CSS color string.")
        if key == "position" and not (isinstance(value, (list, tuple)) and len(value) == 3
                                     and all(_finite(v) or isinstance(v, Expression) for v in value)):
            raise ValueError(f"Plot.lights: {kind}.position must be three finite world coordinates [x, y, z].")
    def plain(value):
        if isinstance(value, (list, tuple)):
            return [plain(item) for item in value]
        if isinstance(value, Integral):
            return int(value)
        if isinstance(value, Real):
            return float(value)
        return value
    return {key: plain(value) for key, value in spec.items()}


def lights_value(value):
    if value is None:
        return None
    if not isinstance(value, (list, tuple)):
        raise TypeError('Plot.lights: pass a list such as [hm.light("ambient", intensity=1)].')
    return [_light_value(spec) for spec in value]
