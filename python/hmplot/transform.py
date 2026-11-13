"""Parameter normalization for the generic Transform component."""
from .core import _snake
from .plugins import check_parameters


def transform_props(previous, props, *, from_browser=False):
    controls = {"kind", "params", "name", "by", "as_", "as"}
    parameters = {key: value for key, value in props.items() if key not in controls}
    result = {key: value for key, value in props.items() if key in controls}
    kind = result.get("kind", previous.get("kind"))
    if not isinstance(kind, str) or not kind:
        raise TypeError('Transform requires kind="registered-kind".')
    if "params" in props and parameters:
        raise TypeError("Transform accepts params={...} or parameter keywords, not both.")
    raw = props.get("params", parameters)
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise TypeError("Transform params must be a dictionary of parameter values.")
    values = {}
    for key, value in raw.items():
        if not isinstance(key, str):
            raise TypeError("Transform parameter names must be strings.")
        if not from_browser and _snake(key) != key:
            raise TypeError(f"Transform: {key!r} is spelled {_snake(key)!r} in Python.")
        parts = key.split("_")
        name = key if from_browser else parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])
        values[name] = value
    # Keyword updates patch parameters; an explicit params dictionary replaces them.
    if "params" not in props and kind == previous.get("kind"):
        values = {**previous.get("params", {}), **values}
    for stage in ("transform", "layout"):
        check_parameters(stage, kind, values, "Transform")
    result["params"] = values
    return result
