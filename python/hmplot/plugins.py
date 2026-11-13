"""Plugins from Python (TODO 138.4). A plugin is JavaScript (src/lib/plot/plugins/registry.js);
Python never ships code. A plugin package carries the plugin's file and a manifest.json beside
it (``node scripts/plugin-manifest.mjs plugin.js`` writes one: name, version, apiVersion, main,
hash and each effect's, shade's and transform's parameter schema) and declares its package under
the ``hmplot.plugins`` entry point, named for the plugin::

    [project.entry-points."hmplot.plugins"]
    acme-hatch = "acme_hatch"

``hm.use_plugin("acme-hatch")`` reads the manifest; then hm.effect and hm.shade check the
plugin's parameters, and a scene naming one of its kinds names the plugin in its state ({name,
version, hash}). The widget, exported HTML and headless exports bring the file to the browser,
which checks it against the hash before running it."""
from __future__ import annotations

import base64
import hashlib
import json
import math
import re
from numbers import Real
from importlib import metadata, resources

from .expressions import Expression

GROUP = "hmplot.plugins"
API_VERSION = 1
STAGES = ("effect", "shade", "transform", "layout")
PARAMETER_TYPES = ("number", "color", "boolean", "select", "string", "field", "expression", "vector", "image", "union", "array", "object")
_NAME = re.compile(r"^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$")
# The library's own effects and presentation hooks (registry.js's RESERVED_EFFECTS), and its
# first-party plugins' (the sky and the atmosphere, bundled; TODO 138.5): no plugin's kind.
RESERVED_EFFECTS = ("sky", "bloom", "fog", "glow", "atmosphere")


class PluginError(ValueError):
    """A plugin that cannot be used: ``code`` is plugin.missing, plugin.failed or plugin.conflict."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def file_hash(data: bytes) -> str:
    """A plugin file's hash as manifests and scene states record it: "sha256-" and its base64."""
    return "sha256-" + base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")


def _show(value):
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        return repr(value)


class Plugin:
    """An installed plugin, from its manifest: ``name``, ``version``, ``hash`` and ``hooks`` (each
    stage's kinds and their parameter schemas). hm.use_plugin returns it."""

    def __init__(self, manifest, file):
        self.name = manifest["name"]
        self.version = manifest["version"]
        self.api_version = manifest["apiVersion"]
        self.hash = manifest["hash"]
        self.hooks = {stage: dict(manifest["hooks"].get(stage, {})) for stage in STAGES}
        self._file = file

    def __repr__(self):
        kinds = ", ".join(f"{stage} {kind}" for stage in STAGES for kind in self.hooks[stage])
        return f"<hmplot plugin {self.name} {self.version}: {kinds or 'declares nothing'}>"

    @property
    def ref(self):
        """What a scene's state names: {name, version, hash}."""
        return {"name": self.name, "version": self.version, "hash": self.hash}

    def read(self) -> bytes:
        """The plugin's file as installed (the browser checks it against the hash)."""
        return self._file.read_bytes()

    def source(self) -> bytes:
        """The plugin's file, checked against its manifest's hash. It is UTF-8 text without a
        byte order mark: pages carry it as text, and the browser hashes that text's bytes."""
        data = self.read()
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as error:
            raise PluginError("plugin.failed", f'Plugin "{self.name}": its file is not UTF-8 text ({error}).') from error
        if text.startswith("\ufeff"):
            raise PluginError("plugin.failed", f'Plugin "{self.name}": its file starts with a byte order mark; save it '
                              "as UTF-8 without one, and write its manifest again.")
        actual = file_hash(data)
        if actual != self.hash:
            raise PluginError("plugin.failed", f'Plugin "{self.name}": its file does not match its manifest\'s hash '
                              f"({self.hash}; the file's is {actual}). Reinstall its package, or write its manifest again "
                              "(node scripts/plugin-manifest.mjs).")
        return data


def _check_schema(owner, schema):
    if not isinstance(schema, dict):
        raise ValueError(f"{owner}: parameters is an object of {{type, default, ...}} by name; got {_show(schema)}.")
    for name, parameter in schema.items():
        if not isinstance(parameter, dict) or parameter.get("type") not in PARAMETER_TYPES:
            kind = parameter.get("type") if isinstance(parameter, dict) else parameter
            raise ValueError(f'{owner}: parameter "{name}" has type {_show(kind)}; it is one of {", ".join(PARAMETER_TYPES)}.')
        kind = parameter["type"]
        if kind == "union":
            variants = parameter.get("variants")
            if not isinstance(variants, list) or not variants:
                raise ValueError(f'{owner}: parameter "{name}" requires nonempty variants.')
            for index, variant in enumerate(variants):
                _check_schema(owner, {f"{name}.variants[{index}]": variant})
        if kind == "object":
            properties = parameter.get("properties")
            _check_schema(f"{owner}.{name}", properties)
            required = parameter.get("required", [])
            if not isinstance(required, list) or any(key not in properties for key in required):
                raise ValueError(f'{owner}: {name}.required must list declared properties.')
        if kind == "array":
            _check_schema(owner, {f"{name}.items": parameter.get("items")})
            for key in ("minLength", "maxLength"):
                value = parameter.get(key)
                if value is not None and (type(value) is not int or value < 0):
                    raise ValueError(f'{owner}: {name}.{key} must be a nonnegative integer.')
            if parameter.get("minLength", 0) > parameter.get("maxLength", float("inf")):
                raise ValueError(f'{owner}: {name} has minLength above maxLength.')


def _manifest_problem(name, manifest):
    """What is wrong with a package's manifest, or ""."""
    if not isinstance(manifest, dict):
        return "it is not a JSON object"
    if manifest.get("name") != name:
        return f'it names plugin {_show(manifest.get("name"))}, and the package declares "{name}"'
    for key in ("version", "main", "hash"):
        if not isinstance(manifest.get(key), str) or not manifest[key]:
            return f"its {key} is {_show(manifest.get(key))}, not a string"
    if not manifest["hash"].startswith("sha256-"):
        return f'its hash is {_show(manifest["hash"])}, not "sha256-" and a base64 SHA-256'
    if "/" in manifest["main"] or "\\" in manifest["main"]:
        return f'its main is {_show(manifest["main"])}; it is the file\'s name, beside the manifest'
    if manifest.get("apiVersion") != API_VERSION:
        return f"it was written for plugin API version {_show(manifest.get('apiVersion'))}, and this HMPlot has version {API_VERSION}"
    hooks = manifest.get("hooks")
    if not isinstance(hooks, dict) or set(hooks) - set(STAGES):
        return f"its hooks are {{{', '.join(STAGES)}}} by stage, each {{kind: {{parameters}}}}"
    computations = set()
    for stage, kinds in hooks.items():
        if not isinstance(kinds, dict):
            return f"its {stage} hooks are {{kind: {{parameters}}}}"
        for kind, hook in kinds.items():
            if stage in ("transform", "layout"):
                if kind in computations:
                    return f'its transform and layout hooks both declare "{kind}"; use distinct kinds'
                computations.add(kind)
            if stage == "effect" and kind in RESERVED_EFFECTS:
                return f'its effect "{kind}" is the name of a built-in effect ({", ".join(RESERVED_EFFECTS)})'
            try:
                _check_schema(f"{stage} {kind}", (hook or {}).get("parameters", {}) if isinstance(hook, dict) else hook)
                if stage in ("transform", "layout"):
                    controls = {"kind", "params", "name", "label", "by", "as", "children", "onconfigure"}
                    for parameter in (hook or {}).get("parameters", {}):
                        if parameter in controls or parameter.startswith("__"):
                            return f'{kind}: parameter "{parameter}" is reserved by Transform; choose another parameter name'
            except ValueError as error:
                return str(error)
    return ""


def installed():
    """The installed plugin packages' entry points, by plugin name."""
    return {entry.name: entry for entry in metadata.entry_points(group=GROUP)}


def _read(entry):
    name = entry.name
    try:
        root = resources.files(entry.load())
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    except Exception as error:
        raise PluginError("plugin.failed", f'Plugin "{name}": its package ({entry.value}) has no readable manifest.json: {error}') from error
    problem = _manifest_problem(name, manifest)
    if problem:
        raise PluginError("plugin.failed", f'Plugin "{name}": its manifest.json is not one HMPlot reads: {problem}.')
    file = root / manifest["main"]
    if not file.is_file():
        raise PluginError("plugin.failed", f'Plugin "{name}": its package has no {manifest["main"]}, the file its manifest names.')
    return Plugin(manifest, file)


# The plugins this process uses, by name (hm.use_plugin).
_USED: dict[str, Plugin] = {}


def use_plugin(name):
    """Use an installed plugin package's effects, shades and transforms (TODO 138.4): by its name,
    never a path or code. hm.effect and hm.shade then check its parameters, and scenes naming its
    kinds bring its file to the browser (notebooks, exported HTML, headless exports), which checks
    it against the hash in the package's manifest. Returns the plugin (its name, version, hash
    and hooks). Plugins bundled with HMPlot need no use_plugin.

    Example:
        hm.use_plugin("acme-hatch")
        hm.Points(x="x", y="y", shade=hm.shade("hatch", spacing=6))
    """
    if not isinstance(name, str) or not _NAME.match(name):
        raise TypeError('hm.use_plugin takes an installed plugin\'s name, as hm.use_plugin("acme-hatch"), never a '
                        f"path or code; got {name!r}.")
    entries = installed()
    if name not in entries:
        listed = ", ".join(sorted(entries)) or "none is installed"
        raise PluginError("plugin.missing", f'hm.use_plugin: no installed package provides plugin "{name}" (packages '
                          f'declare theirs under the "{GROUP}" entry point; installed: {listed}). Install its package.')
    plugin = _read(entries[name])
    plugin.source()
    for other in _USED.values():
        if other.name == name:
            continue
        for stage in STAGES:
            stages = ("transform", "layout") if stage in ("transform", "layout") else (stage,)
            shared = sorted(set(plugin.hooks[stage]) & set().union(*(other.hooks[item] for item in stages)))
            if shared:
                raise PluginError("plugin.conflict", f'Plugin "{name}": {stage} "{shared[0]}" is already plugin '
                                  f'"{other.name}"\'s; use one of them.')
    _USED[name] = plugin
    return plugin


def used(name):
    """The plugin of that name this process uses, or None."""
    return _USED.get(name)


def plugin_of(stage, kind):
    """The used plugin that declares `kind` of `stage`, or None."""
    return next((plugin for plugin in _USED.values() if kind in plugin.hooks[stage]), None)


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _value_problem(name, parameter, value):
    """The browser's check of one value (src/lib/plot/plugins/parameters.js); a color is any
    string here, and the browser checks it is a CSS color. An expression (of inputs) is checked
    in the browser, and only an expression parameter takes one."""
    if value is None or (isinstance(value, Expression) and parameter["type"] == "expression"):
        return ""
    got = f"; got {_show(value)}."
    kind = parameter["type"]
    if kind == "number":
        low, high, integer = parameter.get("min"), parameter.get("max"), parameter.get("integer")
        what = "an integer" if integer else "a number"
        span = (f" from {low} to {high}" if low is not None and high is not None else f" of at least {low}" if low is not None
                else f" of at most {high}" if high is not None else "")
        ok = (_finite(value) and (not integer or float(value).is_integer())
              and (low is None or value >= low) and (high is None or value <= high))
        return "" if ok else f"{name} is {what}{span}{got}"
    if kind == "color":
        return "" if isinstance(value, str) and value else f"{name} is a CSS color{got}"
    if kind == "boolean":
        return "" if isinstance(value, bool) else f"{name} is true or false{got}"
    if kind == "string":
        return "" if isinstance(value, str) else f"{name} is a string{got}"
    if kind == "select":
        options = parameter.get("options", [])
        # Strict as the browser's includes(): True is not 1.
        found = any(option == value and isinstance(option, bool) == isinstance(value, bool) for option in options)
        return "" if found else f"{name} is one of {', '.join(_show(option) for option in options)}{got}"
    if kind == "field":
        ok = (isinstance(value, str) and value) or (
            not isinstance(value, str) and hasattr(value, "__len__")
            and all(item is None or isinstance(item, Real) for item in value))
        return "" if ok else f"{name} is a column's name or one numeric value per input row{got}"
    if kind == "expression":
        return "" if _finite(value) else f"{name} is a number or an expression{got}"
    if kind == "object":
        if not isinstance(value, dict):
            return f"{name} is an object{got}"
        properties = parameter["properties"]
        for key in value:
            if key not in properties:
                return f"{name}.{key} is not a declared property."
        for key in parameter.get("required", []):
            if value.get(key) is None:
                return f"{name}.{key} is required."
        for key, spec in properties.items():
            problem = _value_problem(f"{name}.{key}", spec, value.get(key))
            if problem:
                return problem
        return ""
    if kind == "union":
        problems = [_value_problem(name, variant, value) for variant in parameter["variants"]]
        return "" if any(not problem for problem in problems) else f"{name} must match one of its variants ({' '.join(problems)})."
    if kind == "array":
        if (not isinstance(value, (list, tuple)) or len(value) < parameter.get("minLength", 0)
                or len(value) > parameter.get("maxLength", float("inf"))):
            return f"{name} is an array{got}"
        for index, item in enumerate(value):
            if item is None:
                return f"{name}[{index}] cannot be None; pass an item matching its schema."
            problem = _value_problem(f"{name}[{index}]", parameter["items"], item)
            if problem:
                return problem
        return ""
    if kind == "vector":
        length = parameter.get("length")
        shape = parameter.get("shape", [length])
        def matches(item, dimensions):
            return (_finite(item) if not dimensions else isinstance(item, (list, tuple))
                    and len(item) == dimensions[0] and all(matches(child, dimensions[1:]) for child in item))
        if matches(value, shape):
            return ""
        return (f"{name} is a numeric array of shape {_show(shape)}{got}" if "shape" in parameter
                else f"{name} is a list of {length} numbers{got}")
    return ""


def image_parameters(stage, kind):
    """The names of a used plugin kind's image parameters (TODO 138.5): their values go to the
    browser as image files (hmplot.presentation.image_file)."""
    plugin = plugin_of(stage, kind)
    schema = plugin.hooks[stage][kind].get("parameters", {}) if plugin else {}
    return [name for name, parameter in schema.items() if parameter.get("type") == "image"]


def check_parameters(stage, kind, values, owner):
    """Check a plugin kind's parameter values against its manifest (raises ValueError, naming
    `owner`: "Plot.effects" or "Points.shade"). A kind no used plugin declares passes on to the
    browser, unless an installed one declares it: then hm.use_plugin comes first."""
    plugin = plugin_of(stage, kind)
    if plugin is None:
        for name, entry in installed().items():
            try:
                declares = kind in _read(entry).hooks[stage]
            except PluginError:
                continue
            if declares:
                raise ValueError(f'{owner}: {stage} "{kind}" is plugin "{name}"\'s; call hm.use_plugin("{name}") first.')
        return
    schema = plugin.hooks[stage][kind].get("parameters", {})
    unknown = [key for key, value in values.items() if value is not None and key not in schema]
    if unknown:
        listed = ", ".join(schema) or "it has none"
        raise ValueError(f"{owner}: {kind} {', '.join(_show(key) for key in unknown)} "
                         f"{'are' if len(unknown) > 1 else 'is'} not one of its parameters ({listed}).")
    for name, parameter in schema.items():
        problem = _value_problem(name, parameter, values.get(name))
        if problem:
            raise ValueError(f"{owner}: {kind} {problem}")


def _named_kinds(node, out):
    """The (stage, kind) pairs a state node's props name: a Plot's effects, a mark's shade."""
    props = node.get("props", {})
    effects = props.get("effects")
    if isinstance(effects, list):
        out.extend(("effect", spec["kind"]) for spec in effects if isinstance(spec, dict) and isinstance(spec.get("kind"), str))
    if node.get("kind") == "Transform" and isinstance(props.get("kind"), str):
        out.extend((stage, props["kind"]) for stage in ("transform", "layout"))
    shade = props.get("shade")
    if isinstance(shade, dict) and isinstance(shade.get("kind"), str):
        out.append(("shade", shade["kind"]))
    for child in node.get("children", []):
        _named_kinds(child, out)
    return out


def scene_plugins(root):
    """The plugins a state's tree (its root node) names, as the state lists them: the used plugin
    of each effect and shade kind it names, once each."""
    refs = {}
    for stage, kind in _named_kinds(root, []):
        plugin = plugin_of(stage, kind)
        if plugin is not None:
            refs.setdefault(plugin.name, plugin.ref)
    return list(refs.values())


def payload_sources(state):
    """The files of the plugins a state names, for a page: {name: {hash, source}}. A plugin this
    process does not use (or whose file is gone) is left out, and the page warns plugin.missing."""
    out = {}
    for ref in state.get("plugins", []):
        plugin = used(ref["name"])
        if plugin is None:
            continue
        try:
            source = plugin.read().decode("utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        out[ref["name"]] = {"hash": ref["hash"], "source": source}
    return out
