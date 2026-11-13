"""Validation shared by axis definitions and theme axis defaults."""
from __future__ import annotations

import math
import numbers


def _finite(value):
    return isinstance(value, numbers.Real) and not isinstance(value, bool) and math.isfinite(value)


def check_axis_style(value, where):
    if not isinstance(value, dict):
        raise ValueError(f"{where}: pass an axis settings object.")
    for key in ("line", "ticks", "frame", "mask"):
        if key in value and not isinstance(value[key], bool):
            raise ValueError(f"{where}.{key}: pass True or False.")
    if "tickDirection" in value and value["tickDirection"] not in ("outside", "inside", "both"):
        raise ValueError(f'{where}.tick_direction: pass "outside", "inside", or "both".')
    for key in ("tickSize", "gridWidth"):
        item = value.get(key)
        if item is not None and (not _finite(item) or item < 0):
            name = "tick_size" if key == "tickSize" else "grid_width"
            raise ValueError(f"{where}.{name}: pass a finite, nonnegative number of pixels.")
    if "titleFontWeight" in value:
        weight = value["titleFontWeight"]
        if not _finite(weight) or not 1 <= weight <= 1000:
            raise ValueError(f"{where}.title_font_weight: pass a number from 1 to 1000.")
    if value.get("gridColor") is not None and not isinstance(value["gridColor"], str):
        raise ValueError(f'{where}.grid_color: pass a CSS color such as "#d4d4d4".')
    if "gridDash" in value:
        dash = value["gridDash"]
        if not isinstance(dash, (list, tuple)) or any(not _finite(item) or item < 0 for item in dash):
            raise ValueError(f"{where}.grid_dash: pass a list of finite, nonnegative pixel lengths, or [] for a solid grid.")
    if "threeD" in value:
        if not isinstance(value["threeD"], dict):
            raise ValueError(f'{where}.three_d: pass {{"style": "box", "grid_planes": []}}.')
        check_axes3d(value["threeD"], f"{where}.three_d")


def check_axes3d(value, where):
    if value is None or isinstance(value, bool):
        return
    if not isinstance(value, dict):
        raise ValueError(f'{where}: pass True, False, or {{"style": "box", "grid_planes": []}}.')
    if set(value) - {"style", "gridPlanes"}:
        raise ValueError(f"{where}: accepted settings are style and grid_planes.")
    if value.get("style", "box") not in ("box", "triad"):
        raise ValueError(f'{where}.style: pass "box" or "triad".')
    planes = value.get("gridPlanes", [])
    if not isinstance(planes, (list, tuple)) or any(plane not in ("xy", "xz", "yz") for plane in planes):
        raise ValueError(f'{where}.grid_planes: pass a list containing "xy", "xz", or "yz".')


def axis_value(kind, name, value):
    """Check a normalized Plot/Frame property without changing its serialization."""
    if kind not in ("Plot", "Frame", "Facet") or value is None:
        return value
    if name in ("x", "y", "z") and isinstance(value, dict):
        check_axis_style(value, f"{kind}.{name}")
    elif name in ("axisFrame", "axisMask") and not isinstance(value, bool):
        name = "axis_frame" if name == "axisFrame" else "axis_mask"
        raise ValueError(f"{kind}.{name}: pass True or False.")
    elif name == "axes3d":
        check_axes3d(value, f"{kind}.axes3d")
    return value


def check_frame_guides(node):
    """Explicit masks/frame borders need a rectangular Cartesian frame ancestry."""
    requested = [(key, name) for key, name in (("axisFrame", "axis_frame"), ("axisMask", "axis_mask"))
                 if node.props.get(key) is True]
    configured_3d = isinstance(node.props.get("axes3d"), dict)
    if not requested and not configured_3d:
        return
    ancestors = []
    current = node
    while current is not None:
        if current.kind in ("Plot", "Frame"):
            ancestors.append(current)
        current = current.parent
    def coordinates_at(index):
        return next((item.props["coordinates"] for item in ancestors[index:] if item.props.get("coordinates") is not None), "cartesian")

    coordinates = coordinates_at(0)
    root = next((item for item in ancestors if item.kind == "Plot"), node)
    mode = root.props.get("type", "2d")
    ancestry = []
    for index, item in enumerate(ancestors):
        ancestry.append(coordinates_at(index))
        # A placed Cartesian frame is a new rectangular surface; its parent's curved
        # coordinates locate that surface but do not curve its interior.
        if item.props.get("placement") is not None:
            break
    # Inputs can choose a view mode/coordinate system in the browser. It validates the resolved
    # choice; Python must not try to convert an input expression to bool.
    if isinstance(mode, str) and all(isinstance(value, str) for value in ancestry):
        rectangular = mode != "3d" and all(value == "cartesian" for value in ancestry)
        if not rectangular and requested:
            raise ValueError(f"{node.kind}.{requested[0][1]}: use a rectangular 2D Cartesian plot or frame, or pass False.")
    if configured_3d and isinstance(coordinates, str) and coordinates != "cartesian":
        raise ValueError(f"{node.kind}.axes3d: box and triad guides require Cartesian coordinates; pass False here.")
