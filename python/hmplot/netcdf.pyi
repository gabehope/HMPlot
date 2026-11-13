from typing import Any

from .data import Table

class StreamTable(Table):
    """A grid table of one slice of a dataset along a dimension at a time, following an input
    (hm.stream).

    Example:
        temperature = hm.stream(dataset, dim="time", at=hm.input.step, variables="t2m")
    """
    dim: str
    input_name: str
    by: str
    size: int
    index: int
    @property
    def coords(self) -> Any: ...
    def close(self) -> None: ...

def stream(data: Any, dim: str, at: Any, variables: str | list[str] | None = ..., by: str = ...,
           start: int = ...) -> StreamTable:
    """A grid table of one slice of `data` (an xarray Dataset or DataArray) along `dim`, following
    the input `at` (hm.input.name): the dataset stays in Python and each step sends only the
    variables' values.

    Example:
        hm.Playback(name="step", min=0, max=23)
        temperature = hm.stream(dataset, dim="time", at=hm.input.step, variables="t2m")
        hm.Heatmap(data=temperature, x="lon", y="lat", fill="t2m")
    """
