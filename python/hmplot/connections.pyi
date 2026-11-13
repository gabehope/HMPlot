from typing import Any, Literal as TypingLiteral
from .core import Node

CONNECT_VERSION: int
CONNECTION_KINDS: tuple[str, ...]
ENDPOINT_KINDS: tuple[str, ...]
COMPOUND_ENDPOINT_KINDS: tuple[str, ...]
CONNECTION_CHANNELS: tuple[str, ...]
ORDERS: tuple[str, ...]
ATTACHMENTS: dict[str, dict[str, Any]]
DEFERRED_ENDPOINTS: dict[str, str]

class Endpoint:
    """One endpoint of a connection: a mark (mark.endpoint(at=...)) or the uniquely named mark
    repeated inside a Facet or Partition (facet.endpoint("values")). Immutable.

    Example:
        bars = hm.Rect(x0="x0", x1="x1", y0=0, y1="y")
        labels = hm.Anchor(x="x1", y="label_y")
        hm.charts.Arrows(connections=hm.connect(bars.endpoint(at="top"), labels))
    """
    node: Node | None
    scope: Node | None
    name: str | None
    at: str | None
    def __init__(self, node: Node | None = ..., scope: Node | None = ..., name: str | None = ..., at: str | None = ...) -> None: ...

class Connect:
    """Connections between endpoints, for the connections property of Line, Segments, Arrows3D and
    Arrows (hm.connect). Immutable and versioned.

    Example:
        before = hm.Points(x="x0", y="y")
        after = hm.Points(x="x1", y="y")
        hm.charts.Arrows(connections=hm.connect(before, after))
    """
    version: int
    endpoints: tuple[Endpoint, ...]
    key: str | None
    order: TypingLiteral["facet"] | None
    def __init__(self, endpoints: Any, key: str | None = ..., order: TypingLiteral["facet"] | None = ...) -> None: ...

def connect(*endpoints: Node | Endpoint, key: str | None = ..., order: TypingLiteral["facet"] | None = ...) -> Connect:
    """Connect endpoints: hm.connect(before, after, key="id"), hm.connect(a, b, c, key="id"), or
    hm.connect(values, key="id") for one mark repeated by a Facet or Partition (its cells in
    facet order). Rows pair by row, or by key= when the endpoints show different tables.

    Example:
        before = hm.Points(x="x0", y="y")
        after = hm.Points(x="x1", y="y")
        hm.charts.Arrows(connections=hm.connect(before, after, key="id"))
    """
    ...
