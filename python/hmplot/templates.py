"""Portable templates: a resource-free subset of the existing scene snapshot."""

from __future__ import annotations

import datetime
import inspect
import json
import keyword
import math
from pathlib import Path

from .core import (REGISTRY, Node, Slot, Template, TemplateParam, _NO_TEMPLATE_DEFAULT,
                   accepted_property, active_transaction, _initialize_detached_node)
from .data import Table, literal
from .expressions import Expression
from . import plugins as _plugins

MAX_BYTES = 1024 * 1024
MAX_NODES = 256
MAX_DEPTH = 32
_SPLIT = "Split it into smaller templates."
FORBIDDEN_KINDS = {"Scene", "Provider", "VectorTile", "Markdown"}
RESOURCE_KEYS = {"$table", "$column", "$scale", "$normalization", "$theme", "$selection", "$identity"}
VALUE_KEYS = {"$param", "$ref", "$expression", "$expression_options", "$literal", "$datetime", "$rgb"}
UNSAFE_KEYS = {"__proto__", "prototype", "constructor"}


def _amount(n, unit):
    if unit == "bytes" and n >= MAX_BYTES:
        text = f"{n / MAX_BYTES:,.1f}"
        return f"{text[:-2] if text.endswith('.0') else text} MiB"
    return f"{n:,} {unit}"


def _limit_error(what, limit, unit, hint, count=None):
    """The renderer's capacity error (src/lib/plot/utils/limits.js, limitError), word for word."""
    size = (f"needs more than {_amount(limit, unit)}" if count is None
            else f"needs {_amount(count, unit)}; the limit is {_amount(limit, unit)}")
    return ValueError(f"PortableTemplate: {what} {size}. {hint}")


def _bytes_error(count):
    return _limit_error("a template's JSON", MAX_BYTES, "bytes", "Keep data out of templates; pass it in.", count)


def _walk_value(value, visit):
    visit(value)
    if isinstance(value, Expression):
        for item in value.args:
            _walk_value(item, visit)
    elif isinstance(value, dict):
        for item in value.values():
            _walk_value(item, visit)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _walk_value(item, visit)


def _parameters(template):
    params = {}

    def collect(value):
        if not isinstance(value, TemplateParam):
            return
        spec = {} if value.default is _NO_TEMPLATE_DEFAULT else {"default": value.default}
        try:
            encoded = json.dumps(spec, allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise TypeError(f"Template parameter {value.name!r}: default must be plain JSON.") from exc
        if value.name in params and json.dumps(params[value.name], sort_keys=True) != json.dumps(spec, sort_keys=True):
            raise ValueError(f"Template parameter {value.name!r} has conflicting defaults.")
        params[value.name] = json.loads(encoded)

    def walk(node):
        _walk_value(node.props, collect)
        for child in node.children:
            walk(child)

    walk(template)
    return params


def _unsafe_url(value):
    return isinstance(value, str) and (value.lstrip().lower().startswith(("http:", "https:", "//", "data:", "blob:", "javascript:"))
                                       or "url(" in value.lower())


def validate_definition(definition):
    """Reject executable, network-backed and resource-backed scene content before instantiation."""
    if not isinstance(definition, dict) or definition.get("protocol") != REGISTRY["protocol"]:
        raise ValueError("PortableTemplate: unsupported scene protocol.")
    if definition.get("library") != REGISTRY["library"]:
        raise ValueError("PortableTemplate: library version differs; use a matching HMPlot release.")
    meta = definition.get("template")
    if not isinstance(meta, dict) or meta.get("version") != 1:
        raise ValueError("PortableTemplate: unsupported template version.")
    parameters = meta.get("parameters")
    if not isinstance(parameters, dict):
        raise ValueError("PortableTemplate: parameters must be an object.")
    for name, spec in parameters.items():
        if not isinstance(name, str) or not name.isidentifier() or name.startswith("_") or not isinstance(spec, dict) or set(spec) - {"default"}:
            raise ValueError(f"PortableTemplate: invalid parameter {name!r}.")
        if "default" in spec:
            check_value(spec["default"], parameters, set(), default=True)
    required = meta.get("plugins", [])
    if not isinstance(required, list) or any(
            not isinstance(ref, dict) or set(ref) != {"name", "version", "hash"} or not all(isinstance(v, str) and v for v in ref.values())
            or not _plugins._NAME.match(ref["name"]) for ref in required):
        raise ValueError("PortableTemplate: plugins must be a list of {name, version, hash}.")
    root = definition.get("root")
    if not isinstance(root, dict) or root.get("kind") != "Template":
        raise ValueError("PortableTemplate: root must be a Template node.")
    ids = set()
    references = set()

    def visit(node, depth):
        if depth > MAX_DEPTH or len(ids) >= MAX_NODES:
            raise (_limit_error("a template's nesting", MAX_DEPTH, "levels", _SPLIT) if depth > MAX_DEPTH
                   else _limit_error("a template's tree", MAX_NODES, "nodes", _SPLIT))
        if not isinstance(node, dict) or not isinstance(node.get("id"), str) or not node["id"] or node["id"] in ids:
            raise ValueError("PortableTemplate: node IDs must be unique nonempty strings.")
        ids.add(node["id"])
        kind = node.get("kind")
        spec = REGISTRY["components"].get(kind)
        if spec is None or kind in FORBIDDEN_KINDS:
            raise ValueError(f"PortableTemplate: {kind} is not allowed in a portable template.")
        props, events, children = node.get("props"), node.get("events"), node.get("children")
        if not isinstance(props, dict) or events != [] or not isinstance(children, list):
            raise ValueError(f"PortableTemplate: {kind} needs props, empty events, and children.")
        if children and not spec.get("container"):
            raise ValueError(f"PortableTemplate: {kind} cannot contain children.")
        # A nested template's one prop is its contract (TODO 130.2 slice 11); the root's is the
        # file's template.contract.
        if kind == "Slot" and props or kind == "Template" and set(props) - ({"contract"} if node is not root else set()):
            raise ValueError(f"PortableTemplate: {kind} takes no properties"
                             f"{' but its contract' if kind == 'Template' and node is not root else ''}.")
        for key, value in props.items():
            if kind == "Template":
                continue
            if key in UNSAFE_KEYS or accepted_property(kind, key) != key:
                raise ValueError(f"PortableTemplate: {kind}.{key} is not a declared property.")
            if (kind, key) == ("Image", "data") and isinstance(value, str):
                raise ValueError(f"PortableTemplate: {kind}.{key} cannot load an image address from the file.")
            if (kind, key) == ("Plot", "effects") and isinstance(value, list) and any(
                    isinstance(spec, dict) and spec.get("kind") == "sky" and isinstance(spec.get("image"), str) for spec in value):
                raise ValueError("PortableTemplate: Plot.effects cannot load a sky image address from the file.")
            check_value(value, parameters, references)
        for child in children:
            visit(child, depth + 1)

    visit(root, 0)
    if references - ids:
        raise ValueError(f"PortableTemplate: unresolved node reference {sorted(references - ids)[0]!r}.")
    _check_contract(meta.get("contract", {}), root, root)
    for node in _flatten(root):
        if node["kind"] == "Template" and node is not root and "contract" in node["props"]:
            _check_contract(node["props"]["contract"], node, root)
    slot = meta.get("slot")
    if slot is not None:
        matches = [node for node in _flatten(root) if node["id"] == slot]
        if len(matches) != 1 or matches[0]["kind"] != "Slot" or matches[0]["children"]:
            raise ValueError("PortableTemplate: slot must identify an empty Slot node.")
    return definition


def check_value(value, parameters, references, *, default=False, depth=0):
    if depth > MAX_DEPTH:
        raise _limit_error("a template's property values", MAX_DEPTH, "levels", "Nest property values less deeply.")
    if value is None or isinstance(value, bool) or isinstance(value, int):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("PortableTemplate: numbers must be finite.")
        return
    if isinstance(value, str):
        if _unsafe_url(value):
            raise ValueError("PortableTemplate: external URLs are not allowed.")
        return
    if isinstance(value, list):
        for item in value:
            check_value(item, parameters, references, default=default, depth=depth + 1)
        return
    if not isinstance(value, dict) or any(not isinstance(k, str) or k in UNSAFE_KEYS for k in value):
        raise ValueError("PortableTemplate: properties must contain plain JSON values.")
    tagged = [key for key in value if key.startswith("$")]
    if tagged:
        if default or len(tagged) != 1 or len(value) != 1:
            raise ValueError("PortableTemplate: invalid value descriptor.")
        key = tagged[0]
        if key in RESOURCE_KEYS or key not in VALUE_KEYS:
            raise ValueError(f"PortableTemplate: {key} needs an embedded resource or is unsupported.")
        item = value[key]
        if key == "$param":
            if not isinstance(item, str) or item not in parameters:
                raise ValueError(f"PortableTemplate: undeclared parameter {item!r}.")
            return
        if key == "$ref":
            if not isinstance(item, str):
                raise ValueError("PortableTemplate: reference must be a node ID.")
            references.add(item)
            return
        if key == "$expression":
            if not isinstance(item, dict) or not isinstance(item.get("op"), str) or not isinstance(item.get("args"), list):
                raise ValueError("PortableTemplate: invalid expression descriptor.")
        if key == "$datetime" and not isinstance(item, (int, float)):
            raise ValueError("PortableTemplate: invalid datetime descriptor.")
    for item in value.values():
        check_value(item, parameters, references, default=default, depth=depth + 1)


def _own_nodes(template):
    """The nodes a template's contract may name: its subtree without the template itself and the
    caller's children in its slot. As in the browser's scopes, a Template opens a scope and a Slot
    returns to the one outside the scope it sits in, so a slot inside a deeper template's slot is
    this template's, and a deeper template's slot content is this template's own."""
    def walk(node, depth):
        for child in node["children"]:
            inner = depth + 1 if child["kind"] == "Template" else depth - 1 if child["kind"] == "Slot" else depth
            if inner == 0:
                continue  # the caller's children, in this template's slot
            yield child
            yield from walk(child, inner)

    return list(walk(template, 1))


def _kind_name(contract):
    kind = contract.get("kind") if isinstance(contract, dict) else None
    return kind if isinstance(kind, str) and 0 < len(kind) <= 64 and kind.isprintable() else None


def _check_contract(contract, template, root):
    """A contract block (TODO 130.2): the root's in template.contract, a nested template's (slice
    11) as its contract prop, which also names its kind. Ids are of the template's own nodes."""
    nested = template is not root
    named = _kind_name(contract)
    where = ("contract" if not nested else f"the nested {named} template ({template['id']!r})'s contract" if named
             else f"the nested template {template['id']!r}'s contract")
    kinds = {node["id"]: node["kind"] for node in _own_nodes(template)}
    marks = {node for node, kind in kinds.items() if kind in REGISTRY["marks"]}
    parts = contract.get("parts", {}) if isinstance(contract, dict) else None
    if not isinstance(contract, dict) or set(contract) - {"main", "parts", "legendEntries", *(("kind",) if nested else ())} or (
            "kind" in contract and _kind_name(contract) is None) or (
            "main" in contract and not (isinstance(contract["main"], str) and contract["main"] in marks)) or (
            not isinstance(parts, dict) or any(
                not isinstance(name, str) or not name or not isinstance(node, str) or kinds.get(node, "Slot") == "Slot"
                for name, node in parts.items())):
        raise ValueError(f"PortableTemplate: {where} must be {{{'kind, ' if nested else ''}main, parts}}: main the id "
                         "of one of the template's marks, parts ids of its components (not its root or slot)"
                         f"{', kind a printable name of up to 64 characters' if nested else ''}.")
    entries = contract.get("legendEntries", [])
    drawn = {node for node in marks if kinds[node] != "Anchor"}
    listed = [part for entry in entries if isinstance(entry, dict) and isinstance(entry.get("parts"), list)
              for part in entry["parts"]] if isinstance(entries, list) else []
    if not isinstance(entries, list) or ("main" in contract and entries) or len(listed) != len(set(map(str, listed))) or any(
            not isinstance(entry, dict) or set(entry) != {"swatch", "parts"} or not isinstance(entry["parts"], list)
            or entry["swatch"] not in entry["parts"] or any(not isinstance(part, str) or part not in drawn for part in entry["parts"])
            for entry in entries):
        raise ValueError(f"PortableTemplate: {where}.legendEntries must be [{{swatch, parts}}] with no main: parts "
                         "ids of the template's marks, each in one entry, and swatch one of them.")


def _flatten(node):
    yield node
    for child in node["children"]:
        yield from _flatten(child)


def _descendants_of(node):
    for child in node.children:
        yield child
        yield from _descendants_of(child)


def _file_contract(template):
    """What hm.contract(...) declared (TODO 130.2), by node id: the main part (its innermost
    mark), named parts and legend entries."""
    contract = {}
    marks = template._marks()
    # Written when declared, or when it comes from a nested template's contract.
    # A main part with no one mark (a group template, or one with no marks) has nothing to follow
    # and raises on use, so the file leaves it out.
    if template._contract.get("main") is not None or (len(marks) == 1 and isinstance(marks[0], Template)):
        main = template._main_mark()
        if main is not None and main.kind in REGISTRY["marks"]:
            contract["main"] = main.id
    if template._contract.get("parts"):
        contract["parts"] = {name: node.id for name, node in template._contract["parts"].items()}
    if template._contract.get("legend_entries"):
        contract["legendEntries"] = [{"swatch": entry["swatch"].id, "parts": [part.id for part in entry["parts"]]}
                                     for entry in template._contract["legend_entries"]]
    return contract


def export_template(template, path):
    if template.slot is not None and template.slot.children:
        raise ValueError(f"{template._name}: export_template needs an empty slot; add caller children after loading.")
    scene = template._scene()
    state, _ = scene._snapshot()
    root = next(node for node in _flatten(state["root"]) if node["id"] == template.id)
    # A Template node's contract prop is the scene's; the file keeps the root's in its contract
    # block and each nested template's as its contract prop (slice 11), both by node id.
    nested = {node.id: node for node in _descendants_of(template) if isinstance(node, Template)}
    for item in _flatten(root):
        if item["kind"] == "Template":
            item["props"] = {} if item is root else {"contract": {"kind": nested[item["id"]]._name,
                                                                  **_file_contract(nested[item["id"]])}}
    definition = {
        "protocol": state["protocol"], "library": state["library"],
        "template": {"version": 1, "parameters": _parameters(template),
                     "slot": template.slot.id if template.slot is not None else None},
        "root": root,
    }
    contract = _file_contract(template)
    if contract:
        definition["template"]["contract"] = contract
    # The plugins its effects and shades name (TODO 138.4), which loading it uses.
    required = _plugins.scene_plugins(root)
    if required:
        definition["template"]["plugins"] = required
    validate_definition(definition)
    content = json.dumps(definition, indent=2, allow_nan=False) + "\n"
    if len(content.encode()) > MAX_BYTES:
        raise _bytes_error(len(content.encode()))
    Path(path).write_text(content)
    return Path(path)


def _bind(definition, values):
    specs = definition["template"]["parameters"]
    extra = set(values) - set(specs)
    missing = {name for name, spec in specs.items() if name not in values and "default" not in spec}
    if extra or missing:
        raise TypeError(f"PortableTemplate: unknown parameters {sorted(extra)}; missing parameters {sorted(missing)}.")
    return {name: values[name] if name in values else spec["default"] for name, spec in specs.items()}


def _build(instance, definition, values):
    bound = _bind(definition, values)
    records = list(_flatten(definition["root"]))
    by_id = {definition["root"]["id"]: instance}

    kinds = {}

    def skeleton(record, parent, scopes):
        kind = record["kind"]
        cls = Template if kind == "Template" else Slot if kind == "Slot" else Node
        if kind == "Template":
            # A nested template keeps its kind (its settings group's label, its errors' name).
            name = record["props"].get("contract", {}).get("kind", "Template")
            cls = kinds.setdefault(name, type(name, (Template,), {"__module__": Template.__module__}))
        node = cls.__new__(cls)
        _initialize_detached_node(node, kind, parent=parent)
        if kind == "Template":
            node.slot = None
            node._contract = {}
            scopes = (*scopes, node)
        elif kind == "Slot":
            # A Slot belongs to the template whose scope it sits in, and its children to the
            # scope outside that one (as in the browser).
            node.template = instance if record["id"] == definition["template"]["slot"] else scopes[-1]
            if node.template.slot is None:
                node.template.slot = node
            scopes = scopes[:-1] or (instance,)
        parent.children.append(node)
        by_id[record["id"]] = node
        if record["id"] == definition["template"]["slot"]:
            instance.slot = node
        for child in record["children"]:
            skeleton(child, node, scopes)

    for child in definition["root"]["children"]:
        skeleton(child, instance, (instance,))

    def decode(value):
        if isinstance(value, list):
            return [decode(item) for item in value]
        if not isinstance(value, dict):
            return value
        if "$param" in value:
            return bound[value["$param"]]
        if "$ref" in value:
            return by_id[value["$ref"]]
        if "$expression" in value:
            item = value["$expression"]
            return Expression(item["op"], *(decode(arg) for arg in item["args"]))
        if "$literal" in value:
            return literal(decode(value["$literal"]))
        if "$datetime" in value:
            return datetime.datetime.fromtimestamp(value["$datetime"] / 1000, datetime.timezone.utc)
        if "$rgb" in value:
            from .data import rgb
            return rgb(**{key: decode(item) for key, item in value["$rgb"].items()})
        if "$expression_options" in value:
            return value
        return {key: decode(item) for key, item in value.items()}

    def restore(contract):
        return {"main": by_id[contract["main"]] if "main" in contract else None,
                "parts": {name: by_id[node] for name, node in contract.get("parts", {}).items()},
                "legend_entries": [{"swatch": by_id[entry["swatch"]], "parts": [by_id[part] for part in entry["parts"]]}
                                   for entry in contract.get("legendEntries", [])]}

    for record in records[1:]:
        node = by_id[record["id"]]
        if node.kind == "Template":
            node._contract = restore(record["props"].get("contract", {}))
            continue
        props = {key: decode(value) for key, value in record["props"].items()}
        if node.kind == "Data" and "value" in props and not isinstance(props["value"], Table):
            props["value"] = Table(props["value"])
        node._set(props, from_browser=True)
    instance._contract = restore(definition["template"].get("contract", {}))
    instance._changed(active_transaction())


def _use_required(definition, path):
    """Use the plugins a template records (TODO 138.4). One not installed, or installed in another
    version, is a warning: its effects and shades draw without it (plugin.missing in the browser)."""
    import warnings

    for ref in definition["template"].get("plugins", []):
        name = ref["name"]
        if name not in _plugins.installed():
            warnings.warn(f'{path}: the template uses plugin "{name}" {ref["version"]}, which is not installed; '
                          "its effects and shades draw without it. Install its package.", stacklevel=3)
            continue
        try:
            plugin = _plugins.use_plugin(name)
        except _plugins.PluginError as error:
            warnings.warn(f"{path}: the template uses plugin \"{name}\", which cannot be used ({error}); "
                          "its effects and shades draw without it.", stacklevel=3)
            continue
        if plugin.hash != ref["hash"]:
            warnings.warn(f'{path}: the template was made with plugin "{name}" {ref["version"]}; '
                          f"{plugin.version} is installed, and draws it.", stacklevel=3)


def load_template(path: str | Path) -> type[Template]:
    """Load a portable JSON definition as a callable Template subclass.

    Example:
        @hm.template
        def trend(x):
            with hm.Plot(data={"day": [0, 1]}):
                hm.Line(x=x, y="day")
        trend(hm.template_param("x")).export_template("trend.hmplot.json")
        loaded = hm.load_template("trend.hmplot.json")
    """
    if Path(path).stat().st_size > MAX_BYTES:
        raise _bytes_error(Path(path).stat().st_size)
    raw = Path(path).read_bytes()
    if len(raw) > MAX_BYTES:
        raise _bytes_error(len(raw))
    definition = validate_definition(json.loads(raw))
    _use_required(definition, path)

    class LoadedTemplate(Template):
        # Its parameters by name (a keyword such as "from" cannot be in a signature): other
        # keywords are props of the main part.
        _parameter_names = tuple(definition["template"]["parameters"])

        def build(self, **params):
            _build(self, definition, params)

    LoadedTemplate.__name__ = Path(path).stem.removesuffix(".hmplot").replace("-", "_")
    # Its parameters, keyword-only, as the call's signature (help(), inspect, editors); a file
    # naming one with a Python keyword ("from") keeps **params.
    parameters = definition["template"]["parameters"]
    if not any(keyword.iskeyword(name) for name in parameters):
        LoadedTemplate.__signature__ = inspect.Signature([
            inspect.Parameter(name, inspect.Parameter.KEYWORD_ONLY,
                              default=spec.get("default", inspect.Parameter.empty))
            for name, spec in parameters.items()])
    return LoadedTemplate
