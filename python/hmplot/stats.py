"""Statistical transforms composed from core operations.

Example:
    with hm.Plot(data={"x": [1, 2, 3]}):
        with hm.stats.Normalize(field="x"):
            hm.Points(x="x", y="normalized")
"""
from .core import REGISTRY as _REGISTRY
from ._components import component_class as _component_class

__all__ = [name for name, spec in _REGISTRY["components"].items() if spec.get("tier") == "stats"]
for _name in __all__:
    globals()[_name] = _component_class(_name, __name__)
