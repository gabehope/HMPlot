"""Chart patterns built from HMPlot's core marks and transforms.

Example:
    with hm.Plot():
        hm.charts.Bar(x=["A", "B"], y=[2, 3])
"""
from .core import REGISTRY as _REGISTRY
from ._components import component_class as _component_class

__all__ = [name for name, spec in _REGISTRY["components"].items() if spec.get("tier") == "charts"]
for _name in __all__:
    globals()[_name] = _component_class(_name, __name__)
