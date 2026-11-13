"""Connections between marks: ``hm.connect`` and ``mark.endpoint``.

A connection-backed Line, Segments, Arrows3D, or Arrows takes its positions from other
marks instead of from x/y/z columns::

    with hm.Plot(data=pairs):
        before = hm.Points(x="x0", y="y", name="before")
        after = hm.Points(x="x1", y="y", name="after")
        hm.Arrows3D(connections=hm.connect(before, after, key="id"))

``connect`` returns an immutable, versioned descriptor that holds references to the endpoint
nodes and nothing else: the browser resolves the endpoints, matches their rows (by ``key`` or
by shared source observation), and gathers the positions on the GPU. The descriptor travels in
the scene snapshot as ``{"$connect": {...}}`` with ``$ref`` endpoint ids (python/PROTOCOL.md).

The name lists and attachment tables come from the renderer (``registry.json`` ->
``connections``, generated from src/lib/plot/utils/connections.js), and the error texts mirror
that module's, with Python call syntax where the JavaScript text shows JavaScript syntax.
"""
from __future__ import annotations

import json
from pathlib import Path

_REGISTRY = json.loads(Path(__file__).with_name("registry.json").read_text())["connections"]

#: The descriptor format version this library writes and reads.
CONNECT_VERSION = _REGISTRY["version"]
#: Marks that accept ``connections=``.
CONNECTION_KINDS = tuple(_REGISTRY["kinds"])
#: Marks that can be endpoints (``mark.endpoint()`` or the mark itself in ``connect``).
ENDPOINT_KINDS = tuple(_REGISTRY["endpointKinds"])
#: Compound marks whose endpoint is the shape they draw (bars, boxes).
COMPOUND_ENDPOINT_KINDS = tuple(_REGISTRY["compoundEndpointKinds"])
#: Channels a connection-backed mark takes from its endpoints instead.
CONNECTION_CHANNELS = tuple(_REGISTRY["channels"])
#: Accepted ``order`` values.
ORDERS = tuple(_REGISTRY["orders"])
#: Attachment names per endpoint kind: ``{kind: {"default": name | None, "names": [...]}}``.
ATTACHMENTS = {kind: {"default": table["default"], "names": tuple(table["names"])}
               for kind, table in _REGISTRY["attachments"].items()}
#: Mark kinds that cannot be endpoints yet, with the reason.
DEFERRED_ENDPOINTS = dict(_REGISTRY["deferred"])
#: Components whose ``endpoint(name)`` selects a mark repeated in their cells or groups.
SCOPE_KINDS = ("Facet", "Partition")
_VIEW_KINDS = ("Plot",)

# ---------------------------------------------------------------------------------------
# Error texts (connections.js mirrors).
# ---------------------------------------------------------------------------------------
CONNECT_EMPTY_ERROR = ('connect: pass the endpoints to connect: marks, mark.endpoint(at=...), '
                       'or facet.endpoint("name").')
CONNECT_ORDER_ARITY_ERROR = 'connect: order="facet" takes one repeated endpoint definition.'
ENDPOINT_BOTH_ERROR = "endpoint: pass a mark or a Facet/Partition selection with a name, not both."
ENDPOINT_NONE_ERROR = ('endpoint: pass a mark (mark.endpoint(at=...)) or a Facet or Partition with the name '
                       'of the mark repeated inside it (facet.endpoint("values")).')
ENDPOINT_SCOPE_ERROR = 'endpoint: a selection by name needs a Facet or Partition, e.g. facet.endpoint("values").'
EXTERNAL_FACET_ENDPOINT_ERROR = ("Facet.endpoint: connections need an embedded Facet (inside a Plot); "
                                 "cells of an external Facet are separate views.")


def _quote(value):
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        return repr(value)


def _list(names):
    return ", ".join(names)


def connect_key_error(key):
    return f"connect: key must name one column (a non-empty string), not {_quote(key)}."


def connect_order_error(order):
    return f'connect: order must be "facet" or omitted, not {_quote(order)}.'


def single_endpoint_error(label):
    return (f'connect: "{label}" is a single mark, so it has nothing to connect to; pass two or more endpoints, '
            "or one mark repeated by a Facet or Partition.")


def connect_version_error(version):
    return f"connect descriptor version {version} is newer than this library supports ({CONNECT_VERSION})."


def connect_argument_error(index):
    return (f"connect: argument {index + 1} is not an endpoint; pass a mark, mark.endpoint(at=...), "
            f'or facet.endpoint("name").')


def connect_scope_argument_error(index):
    return (f"connect: argument {index + 1} is a Facet or Partition; select the repeated mark with "
            f'.endpoint("name").')


def endpoint_at_type_error(at):
    return f'endpoint: at must name an attachment such as "center", "left", or "start", not {_quote(at)}.'


def endpoint_at_error(kind, at, available):
    return f"{kind}.endpoint: {kind} does not offer at={_quote(at)}; available: {_list(available)}."


def scope_endpoint_name_error(scope_kind="Facet"):
    return (f"{scope_kind}.endpoint: pass the name of the repeated endpoint mark, e.g. "
            f'{scope_kind.lower()}.endpoint("values").')


def missing_attachment_error(where, kind, available):
    return f"{where}: {kind} has no default endpoint; choose one with endpoint(at=...) from: {_list(available)}."


def deferred_endpoint_error(where, kind):
    reason = DEFERRED_ENDPOINTS.get(kind, "no attachment table")
    return f"{where}: {kind} endpoints are not supported yet ({reason}); use Anchor at the position you need."


def not_an_endpoint_error(kind):
    return (f"{kind}.endpoint: {kind} is not a mark; endpoints are marks, or a mark repeated inside a "
            f'Facet or Partition (facet.endpoint("values")).')


def endpoint_name_error(kind):
    return (f"{kind}.endpoint: a mark is its own endpoint and takes no name; the name selects a mark "
            f'repeated inside a Facet or Partition, e.g. facet.endpoint("values").')


def connections_kind_error(kind):
    return f"{kind}.connections: only Line, Segments, Arrows3D, and Arrows accept connections."


def connections_channel_error(kind):
    return f"{kind}: connections cannot be combined with x, y, z, position, start, or end."


def connections_value_error(kind):
    return (f"{kind}.connections: pass a connect() descriptor, e.g. "
            f'connections=hm.connect(before, after, key="id").')


def connections_series_error(kind):
    return f"{kind}: connections cannot be combined with series; each connection is already its own path."


def connections_nested_error(where):
    return (f"{where or 'Property'}: hm.connect(...) is the whole value of a Line, Segments, Arrows3D, or "
            "Arrows connections property, not nested inside a list, dict, literal, or expression.")


def endpoint_value_error(where):
    return (f"{where or 'Property'}: an endpoint belongs inside hm.connect(...), e.g. "
            'connections=hm.connect(rect.endpoint(at="left"), anchor).')


def other_view_error(kind, label):
    return f'{kind}.connections: endpoint "{label}" belongs to another Plot; connections stay within one Plot.'


def detached_endpoint_error(kind, label):
    return f'{kind}.connections: endpoint "{label}" is not part of this scene; add it to the Plot before displaying.'


def _node_label(node):
    """How messages name an endpoint: its ``name``, else its kind and id."""
    name = node.props.get("name")
    return name if isinstance(name, str) and name else f"{node.kind} {node.id}"


def _nearest(node, kinds):
    current = node.parent
    while current is not None and current.kind not in kinds:
        current = current.parent
    return current


def _repeated(node):
    """Whether a mark is repeated in the cells of an embedded Facet or the groups of a Partition
    (a Facet or Partition between it and its Plot)."""
    current = node.parent
    while current is not None and current.kind not in _VIEW_KINDS:
        if current.kind in SCOPE_KINDS:
            return True
        current = current.parent
    return False


def _check_single(endpoint):
    """One endpoint alone connects the cells of a repeated mark; a single mark placed in a Plot
    outside any Facet or Partition has nothing to connect to. Unplaced marks are checked when
    the scene validates."""
    node = endpoint.node
    if node is None or _nearest(node, _VIEW_KINDS) is None or _repeated(node):
        return
    raise ValueError(single_endpoint_error(_node_label(node)))


def _attachment_names(kind):
    table = ATTACHMENTS.get(kind)
    return table["names"] if table else ()


# ---------------------------------------------------------------------------------------
# Descriptors
# ---------------------------------------------------------------------------------------
class Endpoint:
    """One endpoint of a connection: a mark (``mark.endpoint(at=...)``) or the uniquely named
    mark repeated inside a Facet or Partition (``facet.endpoint("values", at=...)``).

    ``at`` names where on the mark the connection attaches: ``"center"`` for points and
    anchors, ``"anchor"`` for labels, ``"center"``/``"left"``/``"right"``/``"top"``/``"bottom"``
    for rectangles and bars (plus ``"baseline"``/``"value"`` for bars and histogram bins), and
    ``"start"``/``"end"`` (required) for segments and arrows. Omitted, the mark's default applies.
    Immutable: call ``endpoint()`` again to change it.
    """

    __slots__ = ("node", "scope", "name", "at")
    __array_ufunc__ = None

    def __init__(self, node=None, scope=None, name=None, at=None):
        from .core import Node

        if at is not None and (not isinstance(at, str) or not at):
            raise TypeError(endpoint_at_type_error(at))
        if node is not None and scope is not None:
            raise TypeError(ENDPOINT_BOTH_ERROR)
        # A template stands for its main part.
        node = node._mark("Endpoint") if isinstance(node, Node) else node
        scope = scope._drawn("Endpoint") if isinstance(scope, Node) else scope
        if node is None and scope is None:
            raise TypeError(ENDPOINT_NONE_ERROR)
        if scope is not None:
            if not isinstance(scope, Node) or scope.kind not in SCOPE_KINDS:
                raise TypeError(ENDPOINT_SCOPE_ERROR)
            if not isinstance(name, str) or not name:
                raise TypeError(scope_endpoint_name_error(scope.kind))
        else:
            if not isinstance(node, Node):
                raise TypeError(ENDPOINT_NONE_ERROR)
            _check_endpoint_kind(f"{node.kind}.endpoint", node.kind)
            names = _attachment_names(node.kind)
            if at is not None and at not in names:
                raise ValueError(endpoint_at_error(node.kind, at, names))
        for key, value in (("node", node), ("scope", scope), ("name", name if scope is not None else None), ("at", at)):
            object.__setattr__(self, key, value)

    def __setattr__(self, name, value):
        raise AttributeError("Endpoints are immutable; call endpoint() again to change one.")

    def __delattr__(self, name):
        raise AttributeError("Endpoints are immutable; call endpoint() again to change one.")

    def __reduce__(self):
        return (Endpoint, (self.node, self.scope, self.name, self.at))

    def __bool__(self):
        raise TypeError("endpoint() values cannot be tested or combined; pass them to hm.connect(...).")

    def __repr__(self):
        at = f", at={self.at!r}" if self.at is not None else ""
        if self.scope is not None:
            return f"{self.scope.kind}({self.scope.id}).endpoint({self.name!r}{at})"
        return f"{self.node.kind}({self.node.id}).endpoint({at[2:]})"

    @property
    def _target(self):
        """The node the descriptor references: the mark, or the Facet/Partition."""
        return self.node if self.node is not None else self.scope

    def _descriptor(self, encode):
        if self.scope is not None:
            return {"scope": encode(self.scope), "name": self.name, "at": self.at}
        return {"target": encode(self.node), "at": self.at}


class Connect:
    """Connections between endpoints, for the ``connections`` property of Line, Segments,
    Arrows, and Arrows. Build one with ``hm.connect(...)``.

    ``endpoints`` are the declared slots in order, ``key`` the column matched by exact value in
    every endpoint (``None``: endpoints show observations of one table and match by identity),
    and ``order`` is ``"facet"`` or ``None``; one endpoint repeated across Facet cells or
    Partition groups connects them in facet order either way.
    Immutable and versioned (``version``); it holds node references and no data.
    """

    __slots__ = ("endpoints", "key", "order")
    __array_ufunc__ = None
    version = CONNECT_VERSION

    def __init__(self, endpoints, key=None, order=None):
        for name, value in (("endpoints", tuple(endpoints)), ("key", key), ("order", order)):
            object.__setattr__(self, name, value)

    def __setattr__(self, name, value):
        raise AttributeError("connect() values are immutable; call hm.connect() again to change one.")

    def __delattr__(self, name):
        raise AttributeError("connect() values are immutable; call hm.connect() again to change one.")

    def __reduce__(self):
        return (Connect, (self.endpoints, self.key, self.order))

    def __bool__(self):
        raise TypeError("connect() values cannot be tested or combined; pass one as connections=.")

    def __repr__(self):
        options = "".join(f", {name}={getattr(self, name)!r}" for name in ("key", "order") if getattr(self, name) is not None)
        return f"connect({', '.join(map(repr, self.endpoints))}{options})"

    def _nodes(self):
        """The nodes the descriptor references (marks, Facets, Partitions), in slot order."""
        return [endpoint._target for endpoint in self.endpoints]

    def _descriptor(self, encode):
        return {"$connect": {
            "version": CONNECT_VERSION,
            "key": self.key,
            "order": self.order,
            "endpoints": [endpoint._descriptor(encode) for endpoint in self.endpoints],
        }}


def _holds_connection(value):
    """Whether a connect() or endpoint() value sits in a list, dict, or literal."""
    from .data import Literal

    if isinstance(value, (Connect, Endpoint)):
        return True
    if isinstance(value, Literal):
        return _holds_connection(value.value)
    if isinstance(value, dict):
        return any(_holds_connection(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_holds_connection(item) for item in value)
    return False


def _check_endpoint_kind(where, kind):
    if kind in ENDPOINT_KINDS or kind in COMPOUND_ENDPOINT_KINDS:
        return
    if kind in DEFERRED_ENDPOINTS:
        raise TypeError(deferred_endpoint_error(where, kind))
    raise TypeError(not_an_endpoint_error(kind))


def _endpoint(node, name=None, at=None):
    """``Node.endpoint``: a mark's own endpoint, or a Facet/Partition selection by name."""
    kind = node.kind
    if kind in SCOPE_KINDS:
        if not isinstance(name, str) or not name:
            raise TypeError(scope_endpoint_name_error(kind))
        if kind == "Facet" and node.parent is not None and _nearest(node, _VIEW_KINDS) is None:
            raise ValueError(EXTERNAL_FACET_ENDPOINT_ERROR)
        return Endpoint(scope=node, name=name, at=at)
    if name is not None:
        raise TypeError(endpoint_name_error(kind))
    return Endpoint(node=node, at=at)


def connect(*endpoints, key=None, order=None):
    """Connect endpoints; pass the result as ``connections=`` of a Line, Segments, Arrows3D, or
    Arrows (which then takes no x/y/z, position, or start/end).

    ``hm.connect(before, after, key="id")`` joins the row of ``before`` and the row of
    ``after`` that share an ``id`` value (exact values: ``"1"`` never matches ``1``);
    ``hm.connect(a, b, c, key="id")`` makes three-stop paths; and ``hm.connect(values, key="id")``,
    with ``values = hm.Anchor(...)`` written inside an embedded Facet (or a Partition), connects
    that Anchor's copies in every cell (or group), in facet order.

    Endpoints are marks (``Points``, ``Anchor``, ``Text``, ``Rect``, ``Bar``, ...) or
    ``mark.endpoint(at="left")`` to choose an attachment; ``facet.endpoint("name")`` /
    ``partition.endpoint("name")`` select a repeated mark by name. One endpoint alone must be a
    mark repeated by a Facet or Partition (``order="facet"`` says so explicitly and is the
    default); a repeated mark among other endpoints is an error. Without ``key`` the endpoints
    must show observations of one table and match by observation identity. A key that is
    missing in a slot breaks the path there; a duplicate key in one endpoint is an error. The
    descriptor is immutable.
    """
    from .core import Node

    if key is not None and (not isinstance(key, str) or not key):
        raise TypeError(connect_key_error(key))
    if order is not None and order not in ORDERS:
        raise ValueError(connect_order_error(order))
    if not endpoints:
        raise TypeError(CONNECT_EMPTY_ERROR)
    normalized = []
    for index, value in enumerate(endpoints):
        if isinstance(value, Endpoint):
            normalized.append(value)
            continue
        if not isinstance(value, Node):
            raise TypeError(connect_argument_error(index))
        value = value._mark("hm.connect")  # a template stands for its main part
        if value.kind in SCOPE_KINDS:
            raise TypeError(connect_scope_argument_error(index))
        _check_endpoint_kind("connect", value.kind)
        table = ATTACHMENTS.get(value.kind)
        if table is not None and table["default"] is None:
            raise ValueError(missing_attachment_error("connect", value.kind, table["names"]))
        normalized.append(Endpoint(node=value))
    if order == "facet" and len(normalized) != 1:
        raise ValueError(CONNECT_ORDER_ARITY_ERROR)
    if len(normalized) == 1:
        _check_single(normalized[0])
    return Connect(normalized, key=key, order=order)


def _check_consumer(node, ids):
    """Structural checks of a node's ``connections`` when its scene validates (``ids``: the
    scene's node ids): every endpoint is part of the scene and inside the consumer's View, and a
    Facet selection names an embedded Facet, and one endpoint alone is a repeated mark.
    Matching, attachments, and frames are checked by the renderer, which reports its errors
    like any other property error."""
    value = node.props.get("connections")
    if not isinstance(value, Connect):
        return
    if len(value.endpoints) == 1:
        _check_single(value.endpoints[0])
    view = _nearest(node, _VIEW_KINDS)
    for endpoint in value.endpoints:
        target = endpoint._target
        label = endpoint.name if endpoint.scope is not None else _node_label(target)
        if target.id not in ids:
            raise ValueError(detached_endpoint_error(node.kind, label))
        if endpoint.scope is not None and endpoint.scope.kind == "Facet" and _nearest(endpoint.scope, _VIEW_KINDS) is None:
            raise ValueError(EXTERNAL_FACET_ENDPOINT_ERROR)
        if _nearest(target, _VIEW_KINDS) is not view:
            raise ValueError(other_view_error(node.kind, label))


__all__ = ["Connect", "Endpoint", "connect", "CONNECT_VERSION", "CONNECTION_KINDS", "ENDPOINT_KINDS",
           "COMPOUND_ENDPOINT_KINDS", "CONNECTION_CHANNELS", "ORDERS", "ATTACHMENTS", "DEFERRED_ENDPOINTS"]
