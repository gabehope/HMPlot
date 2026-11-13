import registry from "../scene/registry.json" with { type: "json" };
import { validateSceneProps } from "../scene/settings.js";
import { LIMITS, limitError } from "../plot/utils/limits.js";

/** Whether a mark of `kind` has a legend entry to leave out when it follows a main part (TODO 130.2). */
export function takesLegend(/** @type {string} */ kind) {
  const spec = /** @type {any} */ (registry.components)[kind];
  return registry.marks.includes(kind) && [...(spec?.properties ?? []), ...(spec?.runtimeOptions ?? [])].includes("legend");
}

export const MAX_TEMPLATE_BYTES = LIMITS.templateBytes.value;
const MAX_NODES = LIMITS.templateNodes.value, MAX_DEPTH = LIMITS.templateDepth.value;
const forbiddenKinds = new Set(["Scene", "Provider", "VectorTile", "Markdown"]);
const resources = new Set(["$table", "$column", "$scale", "$normalization", "$theme", "$selection", "$identity"]);
const values = new Set(["$param", "$ref", "$expression", "$expression_options", "$literal", "$datetime", "$rgb"]);
const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;

const plain = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const external = (value) => typeof value === "string" && (/^\s*(?:https?:|\/\/|data:|blob:|javascript:)/i.test(value) || /url\(/i.test(value));

function checkValue(value, parameters, references, depth = 0, inDefault = false) {
  if (depth > MAX_DEPTH) throw limitError("templateDepth", { what: "a template's property values", hint: "Nest property values less deeply." });
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) throw Error("PortableTemplate: numbers must be finite.");
    return;
  }
  if (typeof value === "string") {
    if (external(value)) throw Error("PortableTemplate: external URLs are not allowed.");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) checkValue(item, parameters, references, depth + 1, inDefault);
    return;
  }
  if (!plain(value) || Object.keys(value).some((key) => unsafeKeys.has(key)))
    throw Error("PortableTemplate: properties must contain plain JSON values.");
  const tags = Object.keys(value).filter((key) => key.startsWith("$"));
  if (tags.length) {
    if (inDefault || tags.length !== 1 || Object.keys(value).length !== 1)
      throw Error("PortableTemplate: invalid value descriptor.");
    const tag = tags[0], item = value[tag];
    if (resources.has(tag) || !values.has(tag))
      throw Error(`PortableTemplate: ${tag} needs an embedded resource or is unsupported.`);
    if (tag === "$param") {
      if (typeof item !== "string" || !Object.hasOwn(parameters, item))
        throw Error(`PortableTemplate: undeclared parameter ${JSON.stringify(item)}.`);
      return;
    }
    if (tag === "$ref") {
      if (typeof item !== "string") throw Error("PortableTemplate: reference must be a node ID.");
      references.add(item);
      return;
    }
    if (tag === "$expression" && (!plain(item) || typeof item.op !== "string" || !Array.isArray(item.args)))
      throw Error("PortableTemplate: invalid expression descriptor.");
    if (tag === "$datetime" && typeof item !== "number")
      throw Error("PortableTemplate: invalid datetime descriptor.");
  }
  for (const item of Object.values(value)) checkValue(item, parameters, references, depth + 1, inDefault);
}

/**
 * The nodes a template's contract may name: its subtree without the template itself and the
 * caller's children in its slot. As in the scene's scopes, a Template opens a scope and a Slot
 * returns to the one outside the scope it sits in, so a slot inside a deeper template's slot is
 * this template's, and a deeper template's slot content is this template's own.
 * @param {any} template
 */
function ownNodes(template) {
  const found = [];
  const walk = (node, depth) => {
    for (const child of node.children) {
      const inner = child.kind === "Template" ? depth + 1 : child.kind === "Slot" ? depth - 1 : depth;
      if (inner === 0) continue; // the caller's children, in this template's slot
      found.push(child);
      walk(child, inner);
    }
  };
  walk(template, 1);
  return found;
}

/** A nested contract's kind, when it is a printable name of up to 64 characters. */
const kindName = (/** @type {any} */ contract) => {
  const kind = plain(contract) ? contract.kind : undefined;
  return typeof kind === "string" && kind.length > 0 && kind.length <= 64 && !/[\p{C}\p{Zl}\p{Zp}]|(?! )\p{Zs}/u.test(kind) ? kind : undefined;
};

/**
 * Check a contract block (TODO 130.2): the root's in template.contract, a nested template's
 * (slice 11) as its contract prop, which also names its kind. Ids are of the template's own nodes.
 * @param {any} contract @param {any} template @param {boolean} nested
 */
function checkContract(contract, template, nested) {
  const named = kindName(contract);
  const where = !nested ? "contract" : named ? `the nested ${named} template (${JSON.stringify(template.id)})'s contract` : `the nested template ${JSON.stringify(template.id)}'s contract`;
  const kinds = new Map(ownNodes(template).map((node) => [node.id, node.kind]));
  const parts = plain(contract) ? contract.parts ?? {} : null;
  if (!plain(contract) || Object.keys(contract).some((key) => !["main", "parts", "legendEntries", ...(nested ? ["kind"] : [])].includes(key)) ||
    (Object.hasOwn(contract, "kind") && kindName(contract) === undefined) ||
    (Object.hasOwn(contract, "main") && !(typeof contract.main === "string" && registry.marks.includes(kinds.get(contract.main)))) ||
    !plain(parts) || Object.entries(parts).some(([name, id]) => !name || typeof id !== "string" || (kinds.get(id) ?? "Slot") === "Slot"))
    throw Error(`PortableTemplate: ${where} must be {${nested ? "kind, " : ""}main, parts}: main the id of one of the template's marks, parts ids of its components (not its root or slot)${nested ? ", kind a printable name of up to 64 characters" : ""}.`);
  const entries = contract.legendEntries ?? [];
  const drawn = (/** @type {unknown} */ id) => typeof id === "string" && registry.marks.includes(kinds.get(id)) && kinds.get(id) !== "Anchor";
  const listed = Array.isArray(entries) ? entries.flatMap((entry) => Array.isArray(entry?.parts) ? entry.parts : []) : [];
  if (!Array.isArray(entries) || (Object.hasOwn(contract, "main") && entries.length) || new Set(listed).size !== listed.length ||
    entries.some((entry) => !plain(entry) || Object.keys(entry).sort().join() !== "parts,swatch" || !Array.isArray(entry.parts) ||
      !entry.parts.includes(entry.swatch) || !entry.parts.every(drawn)))
    throw Error(`PortableTemplate: ${where}.legendEntries must be [{swatch, parts}] with no main: parts ids of the template's marks, each in one entry, and swatch one of them.`);
}

/** Validate a JSON template without evaluating code or loading a resource. */
export function validateTemplate(definition) {
  const bytes = JSON.stringify(definition).length;
  if (bytes > MAX_TEMPLATE_BYTES)
    throw limitError("templateBytes", { count: bytes });
  if (!plain(definition) || definition.protocol !== registry.protocol)
    throw Error("PortableTemplate: unsupported scene protocol.");
  if (definition.library !== registry.library)
    throw Error("PortableTemplate: library version differs; use a matching HMPlot release.");
  const meta = definition.template;
  if (!plain(meta) || meta.version !== 1 || !plain(meta.parameters))
    throw Error("PortableTemplate: unsupported template version or parameter list.");
  for (const [name, spec] of Object.entries(meta.parameters)) {
    if (!identifier.test(name) || name.startsWith("_") || !plain(spec) || Object.keys(spec).some((key) => key !== "default"))
      throw Error(`PortableTemplate: invalid parameter ${JSON.stringify(name)}.`);
    if (Object.hasOwn(spec, "default")) checkValue(spec.default, meta.parameters, new Set(), 0, true);
  }
  const root = definition.root;
  if (!plain(root) || root.kind !== "Template") throw Error("PortableTemplate: root must be a Template node.");
  const ids = new Set(), references = new Set();
  const nodes = [];
  const visit = (node, depth) => {
    if (depth > MAX_DEPTH) throw limitError("templateDepth");
    if (ids.size >= MAX_NODES) throw limitError("templateNodes");
    if (!plain(node) || typeof node.id !== "string" || !node.id || ids.has(node.id))
      throw Error("PortableTemplate: node IDs must be unique nonempty strings.");
    ids.add(node.id);
    nodes.push(node);
    const spec = registry.components[node.kind];
    if (!spec || forbiddenKinds.has(node.kind))
      throw Error(`PortableTemplate: ${node.kind} is not allowed in a portable template.`);
    if (!plain(node.props) || !Array.isArray(node.events) || node.events.length || !Array.isArray(node.children))
      throw Error(`PortableTemplate: ${node.kind} needs props, empty events, and children.`);
    if (node.children.length && !spec.container) throw Error(`PortableTemplate: ${node.kind} cannot contain children.`);
    // A nested template's one prop is its contract (TODO 130.2 slice 11); the root's is the file's template.contract.
    if (node.kind === "Slot" && Object.keys(node.props).length ||
      node.kind === "Template" && Object.keys(node.props).some((key) => node === root || key !== "contract"))
      throw Error(`PortableTemplate: ${node.kind} takes no properties${node.kind === "Template" && node !== root ? " but its contract" : ""}.`);
    if (node.kind === "Template") {
      for (const child of node.children) visit(child, depth + 1);
      return;
    }
    validateSceneProps(node.kind, node.props);
    for (const [key, value] of Object.entries(node.props)) {
      if (unsafeKeys.has(key)) throw Error(`PortableTemplate: ${node.kind}.${key} is not a declared property.`);
      if (node.kind === "Image" && key === "data" && typeof value === "string")
        throw Error(`PortableTemplate: ${node.kind}.${key} cannot load an image address from the file.`);
      if (node.kind === "Plot" && key === "effects" && Array.isArray(value) &&
        value.some((spec) => spec?.kind === "sky" && typeof spec.image === "string"))
        throw Error("PortableTemplate: Plot.effects cannot load a sky image address from the file.");
      checkValue(value, meta.parameters, references);
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(root, 0);
  for (const ref of references) if (!ids.has(ref)) throw Error(`PortableTemplate: unresolved node reference ${ref}.`);
  checkContract(meta.contract === undefined ? {} : meta.contract, root, false);
  for (const node of nodes) if (node.kind === "Template" && node !== root && Object.hasOwn(node.props, "contract")) checkContract(node.props.contract, node, true);
  if (meta.slot !== null && meta.slot !== undefined && !nodes.some((node) => node.id === meta.slot && node.kind === "Slot" && !node.children.length))
    throw Error("PortableTemplate: slot must identify an empty Slot node.");
  return definition;
}

let nextInstance = 0;
export function templateInstanceId() { return `portable-${++nextInstance}`; }

/**
 * The id of the template's main part (TODO 130.2): its contract's main, else its only mark.
 * @param {any} definition
 */
function markIds(definition) {
  const marks = [];
  const walk = (node) => {
    if (registry.marks.includes(node.kind) && node.kind !== "Anchor") marks.push(node.id);
    node.children.forEach(walk);
  };
  walk(definition.root);
  return marks;
}

/**
 * The marks a nested template stands for (TODO 130.2 slice 11): its contract main, else its marks
 * (a deeper template with a main part counting as that one); one is its main mark.
 * @param {any} template
 */
function leadingMarks(template) {
  const leads = (/** @type {any} */ node) => node.kind === "Template" && node.props.contract?.main !== undefined;
  if (leads(template)) return [template.props.contract.main];
  const own = ownNodes(template), inside = new Set(own.filter(leads).flatMap((node) => ownNodes(node).map((item) => item.id)));
  return own.filter((node) => !inside.has(node.id)).flatMap((node) => leads(node) ? [node.props.contract.main]
    : registry.marks.includes(node.kind) && node.kind !== "Anchor" ? [node.id] : []);
}

/**
 * Clone a validated scene subtree, substitute explicit values, pass `props` to the main part
 * and bind host events (keyed by contract part, else by a node's name).
 */
export function instantiateTemplate(definition, params = {}, prefix = templateInstanceId(), events = {}, props = {}) {
  validateTemplate(definition);
  if (!plain(params) || !plain(events) || !plain(props)) throw Error("PortableTemplate: params, events and props must be objects.");
  const specs = definition.template.parameters;
  const unknown = Object.keys(params).filter((name) => !Object.hasOwn(specs, name));
  const missing = Object.entries(specs).filter(([name, spec]) => !Object.hasOwn(params, name) && !Object.hasOwn(spec, "default")).map(([name]) => name);
  if (unknown.length || missing.length)
    throw Error(`PortableTemplate: unknown parameters ${unknown.join(", ")}; missing parameters ${missing.join(", ")}.`);
  const bound = Object.fromEntries(Object.entries(specs).map(([name, spec]) =>
    [name, Object.hasOwn(params, name) ? params[name] : spec.default]));
  const ids = new Map();
  const collect = (node) => { ids.set(node.id, `${prefix}:${node.id}`); node.children.forEach(collect); };
  collect(definition.root);
  const decode = (value) => {
    if (Array.isArray(value)) return value.map(decode);
    if (!plain(value)) return value;
    if (Object.hasOwn(value, "$param")) return { $host: bound[value.$param] };
    if (Object.hasOwn(value, "$ref")) return { $ref: ids.get(value.$ref) };
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  };
  const records = new Map();
  const index = (node) => { records.set(node.id, node); node.children.forEach(index); };
  index(definition.root);
  // A nested template part stands for its main mark (slice 11); a group has none to take props or events.
  const through = (/** @type {string} */ id, /** @type {string} */ name, /** @type {string} */ what) => {
    if (records.get(id)?.kind !== "Template") return id;
    const marks = leadingMarks(records.get(id));
    if (marks.length !== 1)
      throw Error(`PortableTemplate: part ${JSON.stringify(name)} is a nested template with ${marks.length ? `${marks.length} marks and no main part` : "no mark"}, so it takes no ${what}; give them to a part that is one mark (hm.contract(parts=...) before exporting).`);
    return marks[0];
  };
  // A main part leads the other marks when it draws (an Anchor draws nothing, so nothing follows it).
  const leading = (/** @type {string | undefined} */ main) => main !== undefined && records.get(main)?.kind !== "Anchor";
  // The marks that follow another (a nested main part's others, a legend entry's parts besides its swatch).
  const followersOf = (/** @type {any} */ template, /** @type {any} */ contract) => leading(contract?.main)
    ? ownNodes(template).filter((node) => registry.marks.includes(node.kind) && node.kind !== "Anchor" && node.id !== contract.main).map((node) => node.id)
    : (contract?.legendEntries ?? []).flatMap((entry) => entry.parts.filter((id) => id !== entry.swatch));
  // A prop named after a contract part is an object of that part's props (TODO 130.2 slice 10).
  const named = definition.template.contract?.parts ?? {}, partProps = new Map();
  for (const [key, value] of Object.entries(props)) {
    if (!Object.hasOwn(named, key)) continue;
    if (!plain(value))
      throw Error(`PortableTemplate: ${key} is a part of this template, so props.${key} is an object of its props ({ ${key}: { color: "gray" } }).`);
    const id = through(named[key], key, "props"), previous = partProps.get(id);
    partProps.set(id, { key: previous ? `${previous.key}, ${key}` : key, value: { ...previous?.value, ...value } });
  }
  props = Object.fromEntries(Object.entries(props).filter(([key]) => !Object.hasOwn(named, key)));
  // Props go to the main part; a group (several marks, no main) takes only visible, for all.
  const keys = Object.keys(props), marks = keys.length ? markIds(definition) : [];
  const declared = definition.template.contract?.main;
  const group = declared === undefined && marks.length > 1 && keys.length === 1 && keys[0] === "visible";
  // A group's visible skips the marks that follow another, nested templates' included: authored, it
  // would outrank following.
  const following = new Set([definition.root, ...records.values()].filter((node) => node.kind === "Template")
    .flatMap((node) => followersOf(node, node === definition.root ? definition.template.contract : node.props.contract)));
  const targets = new Set(!keys.length ? [] : declared !== undefined ? [declared] : marks.length === 1 ? marks
    : group ? marks.filter((id) => !following.has(id)) : []);
  if (keys.length && !targets.size)
    throw Error(marks.length
      ? `PortableTemplate: props (${keys.join(", ")}) go to the template's main part, and it has ${marks.length} marks and no contract main, so it takes only visible; pass them as params, or declare a main part with hm.contract(main=...) before exporting.`
      : `PortableTemplate: props (${keys.join(", ")}) go to the template's main part, and it has no mark; pass them as params.`);
  const names = new Map(), parts = definition.template.contract?.parts ?? {}, byId = new Map();
  // With a main part, the other marks have no legend entry of their own unless the file gives one,
  // nor do a declared legend entry's parts besides its swatch.
  const entries = definition.template.contract?.legendEntries ?? [];
  const entryFollowers = new Set(entries.flatMap((entry) => entry.parts.filter((id) => id !== entry.swatch)));
  const follower = (node) => (leading(declared) ? node.id !== declared : entryFollowers.has(node.id)) &&
    takesLegend(node.kind) && !Object.hasOwn(node.props, "legend");
  const clone = (node) => {
    const own = decode(node.props);
    if (follower(node)) own.legend = false;
    if (targets.has(node.id)) {
      validateSceneProps(node.kind, props);
      for (const [key, value] of Object.entries(props)) own[key] = { $host: value };
    }
    // A nested template's contract, as the scene's Template takes it: its kind (its settings group),
    // its main part or legend entries, and its named marks without a name of their own.
    if (node.kind === "Template" && node !== definition.root) {
      const declared = node.props.contract ?? {}, contract = /** @type {any} */ ({ kind: declared.kind ?? "Template" });
      if (leading(declared.main)) contract.main = ids.get(declared.main);
      else if (declared.legendEntries?.length)
        contract.legendEntries = declared.legendEntries.map((entry) => ({ swatch: ids.get(entry.swatch), parts: entry.parts.map((id) => ids.get(id)) }));
      const parts = Object.entries(declared.parts ?? {}).filter(([, id]) => registry.marks.includes(records.get(id).kind) && typeof records.get(id).props.name !== "string");
      if (parts.length) contract.parts = Object.fromEntries(parts.map(([name, id]) => [name, ids.get(id)]));
      for (const key of Object.keys(own)) delete own[key];
      own.contract = contract;
    }
    const part = partProps.get(node.id);
    if (part) {
      try { validateSceneProps(node.kind, part.value); } catch (error) { throw Error(`PortableTemplate: props.${part.key}: ${/** @type {Error} */ (error).message}`); }
      for (const [key, value] of Object.entries(part.value)) own[key] = { $host: value };
    }
    const copy = { id: ids.get(node.id), kind: node.kind, props: own, events: [], children: node.children.map(clone) };
    byId.set(node.id, copy);
    const name = node.props.name;
    if (typeof name === "string") {
      const found = names.get(name) ?? [];
      found.push(copy);
      names.set(name, found);
    }
    return copy;
  };
  const root = clone(definition.root), handlers = new Map();
  // The root's contract, for the scene's template scope: its other marks follow its main part.
  if (leading(declared)) root.props = { contract: { main: ids.get(declared) } };
  else if (entries.length)
    root.props = { contract: { legendEntries: entries.map((entry) => ({ swatch: ids.get(entry.swatch), parts: entry.parts.map((id) => ids.get(id)) })) } };
  for (const [name, bindings] of Object.entries(events)) {
    const matches = Object.hasOwn(parts, name) ? [byId.get(through(parts[name], name, "events"))] : names.get(name) ?? [];
    if (matches.length !== 1 || !plain(bindings))
      throw Error(`PortableTemplate: event target ${JSON.stringify(name)} must name a contract part or one node, and an event map.`);
    const node = matches[0];
    for (const [event, handler] of Object.entries(bindings)) {
      if (typeof handler !== "function") throw Error(`PortableTemplate: ${name}.${event} needs a function.`);
      node.events.push(event);
      handlers.set(`${node.id}:${event}`, handler);
    }
  }
  return { root, slotId: definition.template.slot === null ? null : ids.get(definition.template.slot), handlers };
}
