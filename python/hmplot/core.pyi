from typing import Any, Self, Callable, Awaitable, Literal, ParamSpec
from pathlib import Path
from .data import SelectionResource
from .connections import Endpoint

class PickEvent:
    """What a callback receives. Every event has view, target, frame and revision; a pointer event
    (click, pointermove, ...) has the pick fields (row_index, data_coordinates, ...);
    camerachange has camera; a Provider's load has rows, ms and load_revision, and its error has
    message and load_revision; viewportchange has viewport.

    Example:
        points = hm.Points(x=[1, 2], y=[3, 4])
        points.on_click(lambda event: print(event.row_index))
    """
    view: str
    target: Node
    frame: Node | None
    revision: int
    # Present only on their events (above), so not optional there.
    camera: dict[str, Any]
    viewport: dict[str, Any]
    rows: int
    ms: float
    load_revision: int
    message: str
    source_index: int | None
    data_coordinates: list[float] | None
    world_coordinates: list[float] | None
    surface_uv: list[float] | None
    facet_cell: str | None
    aggregate: dict[str, Any] | None
    feature: dict[str, Any] | None
    feature_id: str | int | None
    partition_group: str | None
    row_index: int | None
    connection: dict[str, Any] | None
    """A connector's picked connection: {index, key, source, target, slots, pair, ownerRow?};
    each slot is {slot, label, definition, cell, kind, row, key, node} (node: the endpoint's id)."""

Callback = Callable[[PickEvent], Any | Awaitable[Any]]

class SceneError(RuntimeError):
    """An error the browser reported for a displayed scene, raised by the awaited commands
    (when_settled, exports, set_camera, ...): code says what kind, component and property where,
    suggestion what to pass instead.

    Example:
        try:
            await plot.when_settled()
        except hm.SceneError as error:
            print(error.component, error.property, error.suggestion)
    """
    code: str
    target: str | None
    revision: int | None
    component: str | None
    property: str | None
    scope: str | None
    field: str | None
    shape: Any
    suggestion: str | None
    details: dict[str, Any]

class Node:
    """A component. Positional arguments to a container are its children: hm.Plot(points) puts
    points in the plot. Keywords that take a component (target=, hm.connect's endpoints) refer
    to it without moving it. A component created inside a `with` block is attached to that
    block; add() attaches explicitly, and moves a component out of the still-open block that
    created it. A component has one parent.

    Example:
        with hm.Plot(data={"x": [1, 2], "y": [3, 4]}) as plot:
            points = hm.Points(x="x", y="y")
        points.update(size=10)
    """
    id: str
    kind: str
    parent: Node | None
    children: list[Node]
    props: dict[str, Any]
    selection: SelectionResource
    brush: SelectionResource
    hover: SelectionResource
    def __enter__(self) -> Self: ...
    def __exit__(self, *error: Any) -> bool | None: ...
    def add(self, *children: Node) -> Self:
        """Append components and return this container. A component already here moves to
        the end (child order is draw order); one held by another container raises."""
        ...
    def remove(self, child: Node) -> Node: ...
    def clear(self) -> Self: ...
    def update(self, **props: Any) -> Self: ...
    def batch_update(self) -> Any: ...
    def endpoint(self, name: str | None = ..., *, at: str | None = ...) -> Endpoint:
        """This mark as a connection endpoint (mark.endpoint(at="left")), or the named mark a
        Facet or Partition repeats in its cells (facet.endpoint("values"))."""
        ...
    def on_event(
        self,
        event: Literal[
            "click",
            "dblclick",
            "pointermove",
            "pointerenter",
            "pointerleave",
            "contextmenu",
            "camerachange",
            "viewportchange",
        ],
        callback: Callback,
    ) -> Callback: ...
    def on_click(self, callback: Callback) -> Callback: ...
    def on_hover(self, callback: Callback) -> Callback: ...
    async def when_settled(
        self, *, view: str | None = ..., timeout: float = ...,
    ) -> None: ...
    async def when_animations_finished(
        self, *, view: str | None = ..., timeout: float = ...,
    ) -> None: ...
    async def export_png(
        self,
        path: str | Path | None = ...,
        *,
        scale: float = ...,
        view: str | None = ...,
        timeout: float = ...,
    ) -> bytes: ...
    async def export_svg(
        self, path: str | Path | None = ..., *, width: str | float | None = ...,
        height: str | float | None = ..., mode: Literal["auto", "vector", "raster"] = ...,
        raster_dpi: float = ..., text: Literal["embedded", "outlines"] = ...,
        primitive_budget: int = ..., view: str | None = ...,
        timeout: float = ...,
    ) -> bytes: ...
    async def export_pdf(
        self, path: str | Path | None = ..., *, width: str | float | None = ...,
        height: str | float | None = ..., mode: Literal["auto", "vector", "raster"] = ...,
        raster_dpi: float = ..., text: Literal["embedded", "outlines"] = ...,
        primitive_budget: int = ..., view: str | None = ...,
        timeout: float = ...,
    ) -> bytes: ...
    async def export_html(
        self, path: str | Path | None = ..., *, page: bool | dict[str, float | None] = ...,
        view: str | None = ..., timeout: float = ...,
    ) -> bytes: ...
    async def export_mp4(
        self, path: str | Path, *, duration: float, fps: float = ..., start: float = ...,
        scale: float = ..., encoder: Literal["ffmpeg", "browser"] = ..., view: str | None = ...,
        timeout: float = ...,
    ) -> Path: ...
    async def get_time(self, *, view: str | None = ..., timeout: float = ...) -> float: ...
    async def set_time(
        self, time: float | None, *, freeze: bool = ..., view: str | None = ..., timeout: float = ...,
    ) -> float: ...
    async def get_camera(self, *, view: str | None = ..., timeout: float = ...) -> dict[str, Any]: ...
    async def set_camera(
        self, state: dict[str, Any] | None = ..., *, animate: bool = ..., view: str | None = ...,
        timeout: float = ..., **fields: Any,
    ) -> dict[str, Any]: ...
    async def get_viewport(self, *, view: str | None = ..., timeout: float = ...) -> dict[str, Any]: ...
    async def set_viewport(
        self, state: dict[str, Any] | None = ..., *, view: str | None = ...,
        timeout: float = ..., **fields: Any,
    ) -> dict[str, Any]: ...
    async def groups(self, *, view: str | None = ..., timeout: float = ...) -> list[dict[str, Any]]: ...
    async def fit(
        self, *, view: str | None = ..., timeout: float = ...,
    ) -> None: ...
    async def action(
        self, action: str, *, view: str | None = ..., timeout: float = ...,
    ) -> Any: ...

class Input(Node):
    """An input: a value the viewer sets, read by name (hm.input.<name>, or "$name" where a string
    names a column). value is the viewer's latest value; assigning it sets it in every view;
    on_change calls back when it changes.

    Example:
        bins = hm.Slider(name="bins", min=5, max=50, value=20)
        bins.on_change(lambda value: print(value))
    """
    value: Any
    def on_change(self, callback: Callable[[Any], Any]) -> Callable[[Any], Any]: ...

class Scene(Node):
    """A display of several plots and controls: its children (Plots, Rows, Columns, Grids, inputs,
    Titles) are laid out top to bottom; a single Plot needs no Scene. filename= saves an export
    when the with block closes.

    Example:
        with hm.Scene() as scene:
            with hm.Plot(data={"x": [1, 2], "y": [3, 4]}, height=300):
                hm.Points(x="x", y="y")
            with hm.Plot(data={"x": [1, 2], "y": [3, 4]}, height=300):
                hm.Line(x="x", y="y")
    """
    revision: int
    error: str | None
    errors: list[str]
    status: str
    pending: bool
    views: dict[str, dict[str, Any]]
    def __init__(self, *children: Node, gap: float = ...,
        filename: str | Path | None = ...,
        export_options: dict[str, Any] | None = ...,
        **props: Any) -> None:
        """Positional arguments are the scene's children (Plots, Rows, Columns, ...)."""
    def close(self) -> None: ...

_P = ParamSpec("_P")

class Template(Node):
    """A reusable pattern of components with a place for children: subclass it, build the pattern
    in build(), and call hm.slot() where the caller's children go. with/add/remove/clear act on
    the slot; events, selections, endpoints and connections use the main part (hm.contract's
    main, else the only mark), as do keywords build() does not take; exports use the single
    top-level node.

    Example:
        class Panel(hm.Template):
            def build(self, data):
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.slot()

        with Panel({"x": [1, 2], "y": [3, 4]}) as panel:
            hm.Points(x="x", y="y")
    """
    slot: Slot | None
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...
    def build(self, *args: Any, **kwargs: Any) -> None: ...
    def export_template(self, path: str | Path) -> Path: ...
    def part(self, name: str) -> Node: ...
    def update(self, **params: Any) -> Self:
        """Re-run build() in place with these parameters changed; other keywords are props of
        the main part. Components built again (by kind and position) stay the same objects, with
        their ids and outside callbacks; their props come from the new build. The caller's
        children stay in the slot, and a failed build leaves the template as it was.

        Example:
            chart = lollipop("day", "value")
            chart.update(y="other", color="gray")
        """

class TemplateParam:
    name: str
    default: Any

def template_param(name: str, default: Any = ...) -> TemplateParam:
    """Expose a value when exporting an expanded Template as portable JSON. An unmarked
    argument stays fixed in the file.

    Example:
        x = hm.template_param("x", default="day")
    """
    ...

class Slot(Node):
    """Where a Template's children go; created by hm.slot() inside build().

    Example:
        class Panel(hm.Template):
            def build(self):
                with hm.Plot():
                    hm.slot()
    """
    template: Template

def slot() -> None:
    """Mark where a template's children go; call it once inside build() (or a @hm.template
    function).

    Example:
        @hm.template
        def panel(data):
            with hm.Plot(data=data):
                hm.slot()
    """
    ...

def contract(*, main: Node | None = ..., parts: dict[str, Node] | None = ..., legend_entries: list[dict[str, Any]] | None = ...) -> None:
    """Declare a template's main part (the mark events, selections, endpoints and references
    use) and named parts for t.part(name); call it once inside build(). A template with no main
    part may declare legend_entries=[{"label": ..., "swatch": mark, "parts": [marks]}]: one
    legend entry per item, whose parts one click hides together.

    Example:
        @hm.template
        def lollipop(x, y):
            stem = hm.charts.ErrorBars(x=x, y=y, lower=0, upper=y)
            head = hm.Points(x=x, y=y)
            hm.contract(main=head, parts={"stem": stem})
    """
    ...

def template(function: Callable[_P, Any]) -> Callable[_P, Template]:
    """Make a Template subclass from a function that builds components; call hm.slot() where the
    caller's children go.

    Example:
        @hm.template
        def panel(data):
            with hm.Plot(data=data, height=300):
                hm.slot()

        with panel({"x": [1, 2], "y": [3, 4]}) as chart:
            hm.Points(x="x", y="y")
    """
    ...
