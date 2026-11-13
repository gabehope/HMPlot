"""Construct component classes from the generated registry and signatures."""
import inspect as _inspect
import json as _json
from pathlib import Path as _Path
from .core import Node, REGISTRY, INPUT_KINDS as _INPUT_KINDS, Input as _Input, Playback as _Playback, Simulate as _Simulate, PlotNode as _PlotNode
from .pipeline import Pipeline as _Pipeline
_signatures = _json.loads(_Path(__file__).with_name("signatures.json").read_text())
# Python's layout grid is hm.Grid (R2.0), beside Row and Column; the scene names it LayoutGrid.
_PYTHON_NAMES = {"LayoutGrid": "Grid"}
def component_class(_name, module):
    _class = _PYTHON_NAMES.get(_name, _name)
    # Every keyword the component takes (TODO 40.2), as the stubs list them, so editors that
    # read signatures at run time (Jupyter) complete exactly these. Positional arguments are
    # a container's children, LinkViews' plots, and nothing for any other component.
    _role = REGISTRY["components"][_name].get("positional")
    _positional = ("plots" if _role == "plots" else
                   "children" if REGISTRY["components"][_name].get("container") else None)
    # Title and Markdown take their text positionally too (TODO 46), as the stubs say.
    _text = _role == "text"
    _signature = _inspect.Signature([
        *([_inspect.Parameter("__text", _inspect.Parameter.POSITIONAL_ONLY, default=Ellipsis, annotation=str)] if _text else []),
        *([_inspect.Parameter(_positional, _inspect.Parameter.VAR_POSITIONAL)] if _positional else []),
        *[_inspect.Parameter(key, _inspect.Parameter.KEYWORD_ONLY,
                            default=Ellipsis, annotation=annotation)
          for key, annotation in _signatures.get(_name, {}).items()],
        *([_inspect.Parameter("parameters", _inspect.Parameter.VAR_KEYWORD)] if _name == "Transform" else []),
    ])
    _base = (_Playback if _name == "Playback" else _Simulate if _name == "Simulate" else
             _PlotNode if _name == "Plot" else _Input if _name in _INPUT_KINDS else
             # Data and the transforms chain (TODO 144): sales.filter(...).group_by(...).agg(...).
             _Pipeline if _name == "Data" or REGISTRY["components"][_name].get("group") == "Transforms" else Node)
    return type(_class, (_base,), {
        "kind": _name, "__module__": module, "__signature__": _signature,
    })
