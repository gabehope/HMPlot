"""A Plot's effects, and glow (TODO 37, 138.3): the checks of their values, matching the browser's
(src/lib/plot/utils/effects.js), and image files (the sky's image, an Image's data) as they
travel to the browser."""
from __future__ import annotations

import math
from pathlib import Path

from .data import Column, identity
from .expressions import Expression
from .lights import lights_value
from .plugins import check_parameters, image_parameters

_URL_PREFIXES = ("http://", "https://", "data:")
# Image formats a browser decodes, by their files' first bytes.
_SIGNATURES = ((b"\x89PNG\r\n\x1a\n", "image/png"), (b"\xff\xd8\xff", "image/jpeg"), (b"GIF87a", "image/gif"),
               (b"GIF89a", "image/gif"), (b"BM", "image/bmp"))
_PIL_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _mime(data: bytes):
    for signature, mime in _SIGNATURES:
        if data.startswith(signature):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _encoded(data: bytes, what: str):
    mime = _mime(data)
    if mime is None:
        raise ValueError(f"{what} is not a PNG, JPEG, WebP, GIF or BMP file.")
    return Column(identity("image"), (len(data),), "uint8", data, logical_type="encoded-image", mime=mime)


def image_file(value, what="Plot.effects: sky image"):
    """An image file as it goes to the browser (the sky's image, an Image's data; TODO 37.5, 69.10): a
    URL (http, https or data:) as is; a path, bytes or a PIL image as its encoded bytes in one uint8
    column (logical type "encoded-image" and its MIME type), so a JPEG stays a JPEG. The browser
    decodes it with createImageBitmap. Anything else (an Image's pixel array) passes through."""
    component = what.split(":")[0]
    if value is None or isinstance(value, Column):
        return value
    if isinstance(value, str) and value.startswith(_URL_PREFIXES):
        return value
    if isinstance(value, (str, Path)):
        path = Path(value).expanduser()
        if not path.is_file():
            raise ValueError(f"{what} {str(value)!r} is neither a URL (http, https or data:) nor an existing file.")
        return _encoded(path.read_bytes(), f"{what} {str(value)!r}")
    if isinstance(value, (bytes, bytearray, memoryview)):
        return _encoded(bytes(value), f"{what} bytes")
    if type(value).__module__.split(".")[0] == "PIL" and hasattr(value, "save"):
        import io
        target = value.format if value.format in _PIL_FORMATS else "PNG"
        image = value.convert("RGB") if target == "JPEG" and value.mode not in ("RGB", "L") else value
        buffer = io.BytesIO()
        image.save(buffer, format=target)
        return _encoded(buffer.getvalue(), f"{what} PIL image")
    if component == "Plot.effects" or component.endswith(".shade"):
        raise TypeError(f"{what} is a URL, a file path, bytes or a PIL image; got {type(value).__name__}.")
    return value


def presentation_value(kind: str, key: str, value):
    """Check (and for the sky's image, encode) a Plot's effects, a mark's glow, a Frame's
    atmosphere and an Image's data; other props pass through."""
    if key == "glow":
        # An expression of inputs (hm.where(hm.input.glow, 1, 0)) is evaluated in the browser.
        if value is not None and not isinstance(value, Expression) and not (_finite(value) and value >= 0):
            raise ValueError(f"{kind}: glow is a number of at least 0 (0, the default, does not glow); got {value!r}.")
    elif key == "shade":
        return shade_value(kind, value)
    elif kind == "Plot" and key == "lights":
        return lights_value(value)
    elif kind == "Plot" and key == "effects":
        return effects_value(value)
    elif kind == "Frame" and key == "atmosphere":
        return atmosphere_value(value)
    elif kind == "Image" and key == "data":
        return image_file(value, "Image: data")
    return value


# The built-in effects' parameters (the browser's utils/effects.js); any other kind is a plugin's,
# which the browser checks against its schema.
BUILT_IN_EFFECTS = {
    "sky": ("image", "zenith", "horizon", "ground", "rotation", "visible"),
    "bloom": ("strength", "radius"),
    "fog": ("near", "far", "color"),
}
_EFFECTS_FORM = 'Plot.effects is a list of hm.effect(kind, ...), as effects=[hm.effect("fog", near=50, far=200)]'


def effect(kind, **parameters):
    """One of a Plot's effects (TODO 138.3), for Plot(effects=[...]): "sky" (a 3D plot's sky:
    image=, or a gradient's zenith=, horizon= and ground=; rotation=[x, y, z] in degrees;
    visible=), "bloom" (how glowing marks bloom: strength=, radius=), "fog" (a 3D plot's distance
    fog: near=, far=, color=) or a plugin's kind with its parameters. Built-in effects are checked
    here, and a used plugin's (hm.use_plugin) against its manifest; another plugin's in the
    browser, against its schema."""
    if not isinstance(kind, str) or not kind:
        raise TypeError(f"hm.effect takes the effect's kind first, as hm.effect(\"fog\", near=50, far=200); got {kind!r}.")
    return _effect_value({"kind": kind, **parameters})


def shade(kind, **parameters):
    """A plugin's shade for a mark (TODO 138.3), as shade=hm.shade("hatch", spacing=6): the kind a
    plugin declared, with its parameters, which the browser checks against the plugin's schema. It
    recolors each fragment the mark draws; picking, tooltips, domains and legends are unchanged.
    A used plugin's (hm.use_plugin) parameters are checked here, against its manifest."""
    if not isinstance(kind, str) or not kind:
        raise TypeError(f"hm.shade takes the shade's kind first, as hm.shade(\"hatch\", spacing=6); got {kind!r}.")
    return {"kind": kind, **{key: value for key, value in parameters.items() if value is not None}}


def shade_value(component, value):
    """A mark's shade: None, or { kind, ...parameters } (hm.shade)."""
    if value is None or value is False:
        return None
    if not isinstance(value, dict) or not isinstance(value.get("kind"), str) or not value["kind"]:
        raise TypeError(f'{component}: shade is hm.shade(kind, ...), as shade=hm.shade("hatch", spacing=6); got {value!r}.')
    values = {key: item for key, item in value.items() if item is not None}
    check_parameters("shade", values["kind"], {key: item for key, item in values.items() if key != "kind"}, f"{component}.shade")
    return _plugin_values("shade", values["kind"], values, f"{component}.shade")


def _plugin_values(stage, kind, values, owner):
    """A used plugin kind's values as they go to the browser: images as files, vectors as lists."""
    images = image_parameters(stage, kind)
    return {key: image_file(value, f"{owner}: {kind} {key}") if key in images
            else list(value) if isinstance(value, tuple) else value for key, value in values.items()}


def _effect_value(spec):
    kind = spec["kind"]
    values = {key: value for key, value in spec.items() if key != "kind" and value is not None}
    known = BUILT_IN_EFFECTS.get(kind)
    if known is None:
        check_parameters("effect", kind, values, "Plot.effects")
        return {"kind": kind, **_plugin_values("effect", kind, values, "Plot.effects")}
    unknown = [key for key in values if key not in known]
    if unknown:
        raise ValueError(f"Plot.effects: {kind} {', '.join(repr(key) for key in unknown)} "
                         f"{'are' if len(unknown) > 1 else 'is'} not one of its parameters ({', '.join(known)}).")
    if kind == "sky":
        given = [key for key in ("zenith", "horizon", "ground") if key in values]
        if "image" in values and given:
            raise ValueError(f"Plot.effects: sky takes image or the gradient's colors ({', '.join(given)}), not both.")
        for key in given:
            if not isinstance(values[key], str):
                raise TypeError(f"Plot.effects: sky {key} is a CSS color string; got {values[key]!r}.")
        if "image" in values:
            values["image"] = image_file(values["image"])
        rotation = values.get("rotation")
        if rotation is not None:
            if not (isinstance(rotation, (list, tuple)) and len(rotation) == 3 and all(_finite(v) for v in rotation)):
                raise ValueError(f"Plot.effects: sky rotation is [x, y, z] in degrees; got {rotation!r}.")
            values["rotation"] = list(rotation)
        if "visible" in values and not isinstance(values["visible"], (bool, Expression)):
            raise TypeError(f"Plot.effects: sky visible is True or False (or an input, hm.input.stars); got {values['visible']!r}.")
    elif kind == "bloom":
        strength, radius = values.get("strength"), values.get("radius")
        if strength is not None and not (_finite(strength) and strength >= 0):
            raise ValueError(f"Plot.effects: bloom strength is a number of at least 0; got {strength!r}.")
        if radius is not None and not (_finite(radius) and 0 <= radius <= 1):
            raise ValueError(f"Plot.effects: bloom radius is a number from 0 to 1; got {radius!r}.")
    else:
        near, far, color = values.get("near"), values.get("far"), values.get("color")
        # Expressions of inputs (hm.where(hm.input.fog, 150, 1e9)) are checked in the browser (TODO 69.10).
        expressions = isinstance(near, Expression) or isinstance(far, Expression)
        if not expressions and not (_finite(near) and _finite(far) and 0 <= near < far):
            raise ValueError(f"Plot.effects: fog needs finite distances with 0 <= near < far; got near {near!r} and far {far!r}.")
        if color is not None and not isinstance(color, str):
            raise TypeError(f"Plot.effects: fog color is a CSS color (or omitted, for the plot's background); got {color!r}.")
    return {"kind": kind, **values}


def effects_value(effects):
    """A Plot's effects: a list of hm.effect(...) (dicts with a kind), each kind once."""
    if effects is None:
        return effects
    if not isinstance(effects, (list, tuple)):
        raise TypeError(f"{_EFFECTS_FORM}; got {effects!r}.")
    seen, result = set(), []
    for spec in effects:
        if not isinstance(spec, dict) or not isinstance(spec.get("kind"), str) or not spec["kind"]:
            raise TypeError(f"{_EFFECTS_FORM}; got {spec!r} in it.")
        if spec["kind"] in seen:
            raise ValueError(f"Plot.effects lists {spec['kind']} twice; keep one.")
        seen.add(spec["kind"])
        result.append(_effect_value(spec))
    return result


def atmosphere_value(value):
    """A Frame's atmosphere: True, False, or {color, thickness} (thickness a fraction of the radius)."""
    if value is None or isinstance(value, bool):
        return value
    form = "Frame: atmosphere is True, False or {color, thickness} (thickness a fraction of the globe's radius)"
    if not isinstance(value, dict):
        raise TypeError(f"{form}; got {value!r}.")
    unknown = [key for key in value if key not in ("color", "thickness")]
    if unknown:
        raise ValueError(f"{form}; {', '.join(repr(key) for key in unknown)} is not one of them.")
    thickness, color = value.get("thickness"), value.get("color")
    if thickness is not None and not (_finite(thickness) and thickness > 0):
        raise ValueError(f"Frame: atmosphere thickness is a number above 0 (a fraction of the globe's radius); got {thickness!r}.")
    if color is not None and not isinstance(color, str):
        raise TypeError(f"Frame: atmosphere color is a CSS color; got {color!r}.")
    return dict(value)
