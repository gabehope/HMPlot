// @ts-check
// A built-in template's definition (TODO 130.2): data, no functions, so the generator and the
// tests can read it in Node and a host can expand it without code.
//
//   defineTemplate({ kind, params, theme, root: node(kind, props, children, { id, main }) })
//
// A node with `when` mounts only while that evaluates to a value other than false, null or
// undefined (Histogram's brush part); the tree's other nodes keep their places. `settings` puts
// parameters in the settings pane, in the template's own group, kept in step with the caller's
// value both ways: { bins: { option: "histogramBins", text: true } } is a text field (a whole
// number reads as a number, a comma-separated list of numbers as a list), { normalization:
// { option: "histogramNormalization", options: [...] } } a choice. A theme with `routed: true`
// declares the kind its parts take theme entries from, without the host's wrapper: ThemeDefaults
// nodes in the tree route them (Smooth's fill and opacity to its band, color and width to its
// line), and `mainSettings: { omit }` names main-part edits that are not the template's props of
// the same name (a Smooth line's opacity edit is not the Smooth's opacity, its band's).
//
// Props hold plain values, param("name") (the caller's value), prop("name") (the value of a
// caller's prop that is not a parameter, which still goes to rest()), computed(...) (an expression over
// parameters alone, evaluated when the template expands: the tree's shape never depends on it),
// data expressions and literal(...) values, passed to the parts unchanged, and at most
// one ...rest() (the caller's other props). The node holding rest() is the main part unless
// another node says main: true.
//
// A template of several views (TODO 136.16: Marginals) holds Plots: slot() is where the caller's
// children go (inside one of them), and `links` names Plots, by id, that show one domain on the
// axes they share and pan and zoom together, as LinkViews' plots do.

/**
 * @typedef {{ kind: string, props: Record<string, unknown>, children: TemplateNode[], id?: string, main?: boolean, when?: unknown }} TemplateNode
 * @typedef {{ option: string, text?: true | "value", options?: string[] }} TemplateSetting A parameter in
 *   the settings pane: its option key (the pane's label), text parsed as numbers/lists (`true`),
 *   text kept as its value (`"value"`, a column name), or a choice of `options`.
 * @typedef {{ kind: string, defaults?: Record<string, unknown>, values?: Record<string, unknown>, only?: string[], routed?: boolean, beneath?: boolean }} TemplateTheme
 *   `beneath`: the theme's layer goes under the enclosing ones (a compound's ThemeDefaults, a
 *   Mapping), as a primitive mark's own theme entry does, so a template that was a primitive
 *   (ErrorBars) keeps the look its compounds give it; its color and width then come as props.
 * @typedef {{ noun?: string | null, units?: [string, string] }} TemplateDescription What the template's
 *   parts are called in descriptions, keyed by its theme kind: the chart ("ECDF plot"; null
 *   leaves it out) and its rows ([one, many]).
 * @typedef {{ edge?: [number, number], end?: string, from?: string, opposite?: boolean, fraction?: { value: string, low: string, high: string }, alias?: string }} AttachmentForm
 *   A connection attachment of the template's main part (TODO 130.2), by form: `edge` the box's
 *   edge along the value axis ([0, 1] its upper, [1, 0] its lower); `end` the box's edge at the
 *   column `end`, upper where it is at least the column `from`, or the other edge with `opposite`
 *   (a bar's value end, and its baseline end, following the box as it animates); `fraction` the point (value - low) / (high - low) of the
 *   box along the value axis (a box plot's median); `alias` another name for one of the main
 *   part's own attachments (a pie's "outer" is its polar box's "top").
 * @typedef {{ attachments: Record<string, AttachmentForm> }} TemplateEndpoint The main part is a
 *   connection endpoint as the template's kind, with these attachments besides its own; its
 *   value axis comes from the nearest enclosing transform's valueAxis().
 * @typedef {{ parts: string[], axes: "x" | "y" | "xy" }} TemplateLink Plots (node ids) that share one
 *   domain on `axes` and pan and zoom together on them.
 * @typedef {{ kind: string, params: Record<string, unknown>, theme?: TemplateTheme, describe?: TemplateDescription,
 *   endpoint?: TemplateEndpoint, forbid?: Record<string, string>, required?: Record<string, string>, settings?: Record<string, TemplateSetting>,
 *   mainSettings?: { omit: string[] }, label?: string, parts?: string[], links?: TemplateLink[], signature?: TemplateSignature,
 *   output?: { columns: string[], groups?: string }, root: TemplateNode }} TemplateDefinition
 *   `output` declares a transform template: its root publishes these columns (before `as`),
 *   with one Slot for caller children and no main mark.
 *   `label` names the main part in the settings pane and legend when the caller gives no name.
 *   `parts` are named parts (decided 2026-10-13): each is a parameter and the id of a node, and
 *   the caller's object for it is that node's props, over the definition's (Lollipop's stem); a
 *   follower's legend stays false.
 *   `forbid` maps a prop the caller may not pass to the error naming the fix, and `required` a
 *   parameter the caller must pass to the error naming it (a chart's required options).
 *   `signature` is a built-in template's options-table entry and props (TODO 130.5), which the
 *   generator writes from it; defineTemplate checks it and keeps it in the table's form.
 * @typedef {{ tier?: string, group?: string, summary: string, extraProps?: boolean, use?: string[], omit?: string[],
 *   options: Record<string, Record<string, unknown>>, types?: Record<string, string>, required?: string[] }} TemplateSignature
 *   A built-in template's options (TODO 130.5): its options-table entry (tier, group, summary,
 *   use, omit and options, each option(...) or refine(...)), so the generator writes the entry,
 *   the TypeScript props and the Python signature from the definition. `extraProps` gives the
 *   props an index signature: the template passes any other prop to its main part. Checked, it
 *   holds the options as the table writes them, with `types` (each option's `ts`) and `required`
 *   (the options TypeScript requires; the template's wrapper says what is missing).
 */

/** The caller's value of the parameter `name`. @param {string} name */
export const param = (name) => ({ $param: name });

/**
 * The caller's value of a prop that is not a parameter, which rest() still passes on (a Bar's
 * fill: its Prism's color, and its stacking series).
 * @param {string} name
 */
export const prop = (name) => ({ $prop: name });

/**
 * The caller's props that are not parameters, minus `omit`; spread into the main part's props.
 * @param {{ omit?: string[] }} [options]
 */
export const rest = ({ omit = [] } = {}) => ({ $rest: { omit } });

/**
 * One node of the expanded tree.
 * @param {string} kind A registry kind.
 * @param {Record<string, unknown>} [props]
 * @param {TemplateNode[]} [children]
 * @param {{ id?: string, main?: boolean, when?: unknown }} [options]
 * @returns {TemplateNode}
 */
export const node = (kind, props = {}, children = [], { id, main, when } = {}) => ({
  kind, props, children,
  ...(id === undefined ? {} : { id }),
  ...(main === undefined ? {} : { main }),
  ...(when === undefined ? {} : { when }),
});

/** Where the caller's children go: at most one per definition. */
export const slot = () => node("Slot");

// Expressions over parameters: the operation names are Python's (hmplot.expressions), so a
// portable file can carry them. Inside computed(...) a string is a literal, not a column.
const operation = (/** @type {string} */ op) => (/** @type {unknown[]} */ ...args) => ({ $computed: { op, args } });
export const where = operation("where");
/** a + b: a sum, or two strings joined (a part's name from the template's). */
export const add = operation("add");
export const coalesce = operation("coalesce");
export const isMissing = operation("is_missing");
export const equal = operation("equal");
export const notEqual = operation("not_equal");
export const and = operation("logical_and");
export const or = operation("logical_or");
export const not = operation("logical_not");
/**
 * A data expression, evaluated per row by the part, over parameters: dataExpression("less_equal",
 * param("lower"), param("upper")) compares the caller's columns (ErrorBars). Its strings are
 * column names, as in any data expression; the parameters are substituted when the template
 * expands.
 * @param {string} op
 * @param {...unknown} args
 */
export const dataExpression = (op, ...args) => operation("expression")(op, ...args);

/**
 * A template definition, checked: a known shape, declared parameters, one rest().
 * @param {TemplateDefinition} definition
 * @returns {TemplateDefinition}
 */
export function defineTemplate(definition) {
  const { kind, params, root } = definition;
  if (typeof kind !== "string" || !params || typeof params !== "object" || !root)
    throw Error("defineTemplate needs a kind, params and a root node.");
  let rests = 0, mains = 0;
  /** @param {unknown} value */
  const check = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(check);
    const record = /** @type {Record<string, unknown>} */ (value);
    if (typeof record.$param === "string" && !Object.hasOwn(params, record.$param))
      throw Error(`${kind}: param("${record.$param}") is not one of its params.`);
    if ("$expression" in record) return;
    Object.values(record).forEach(check);
  };
  /** Counts the node's rest and main, and says whether its subtree holds the main part. @param {TemplateNode} item @returns {boolean} */
  const walk = (item) => {
    if ("$rest" in item.props) rests++;
    if (item.main) mains++;
    check(item.props);
    check(item.when);
    const holds = item.children.map(walk).some(Boolean) || item.main || "$rest" in item.props;
    if (item.when !== undefined && (holds || item === root))
      throw Error(`${kind}: the root and the main part, and every node above it, are always mounted; put when= on another node.`);
    return holds;
  };
  walk(root);
  check(definition.theme);
  for (const [name, setting] of Object.entries(definition.settings ?? {}))
    if (!Object.hasOwn(params, name) || typeof setting?.option !== "string" || !setting.text === !setting.options)
      throw Error(`${kind}: settings.${name} needs one of its params, an option key, and text: true or options.`);
  if (definition.theme?.routed && (definition.theme.defaults || definition.theme.values))
    throw Error(`${kind}: a routed theme's defaults and values go on its ThemeDefaults nodes, not on theme.`);
  const omit = definition.mainSettings?.omit;
  if (definition.mainSettings && (!Array.isArray(omit) || !omit.every((name) => typeof name === "string")))
    throw Error(`${kind}: mainSettings.omit is a list of prop names.`);
  const ids = new Map();
  let slots = 0;
  /** @param {TemplateNode} item */
  const collect = (item) => {
    if (item.id !== undefined) ids.set(item.id, item.kind);
    if (item.kind === "Slot") slots++;
    item.children.forEach(collect);
  };
  collect(root);
  if (slots > 1) throw Error(`${kind}: only one node is the slot.`);
  for (const link of definition.links ?? [])
    if (!["x", "y", "xy"].includes(link?.axes) || !Array.isArray(link.parts) || link.parts.length < 2 ||
      !link.parts.every((id) => ids.get(id) === "Plot"))
      throw Error(`${kind}: a link names at least two Plots by id and axes "x", "y" or "xy".`);
  for (const part of definition.parts ?? [])
    if (!Object.hasOwn(params, part) || !ids.has(part))
      throw Error(`${kind}: parts names "${part}", which needs to be both one of its params and a node's id.`);
  if (definition.output) {
    if (mains || definition.endpoint || definition.theme ||
        root.children.length !== 1 || root.children[0].kind !== "Slot" ||
        root.children[0].children.length || !Array.isArray(definition.output.columns) ||
        definition.output.columns.some(name => typeof name !== "string" || !name) ||
        (definition.output.groups !== undefined && !Object.hasOwn(params, definition.output.groups)))
      throw Error(`${kind}: a transform template declares output columns and one Slot under its root, without a main mark, endpoint or theme.`);
  }
  if (rests > 1) throw Error(`${kind}: only one node takes rest().`);
  if (mains > 1) throw Error(`${kind}: only one node is main.`);
  if (!definition.signature || checked.has(definition.signature)) return definition;
  const signature = signatureOf(kind, definition.signature);
  checked.add(signature);
  return { ...definition, signature };
}

/**
 * The caller's props a chart's other parts take as its main part does (TODO 130.4): so a
 * Dumbbell's stems or a Candlestick's wicks fade, respond, animate, scale and blend with the
 * points or bodies, and sit on the same axes (a log y, an inverted x). Spread into a part's props
 * with following(); the main part has them through rest().
 */
export const FOLLOWED = Object.freeze(["opacity", "respond", "selectionOpacity", "identity", "enterEffect", "exitEffect", "animation",
  "animationDuration", "animationEasing", "visible", "domains", "blend", "glow", "shade", "maxElements", "transparent",
  ...["x", "y", "z"].flatMap((axis) => [`${axis}Transform`, `${axis}Invert`, `${axis}bounds`, `${axis}range`])]);
/** A part's props for FOLLOWED: each the caller's value of the prop of that name. */
export const following = () => Object.fromEntries(FOLLOWED.map((name) => [name, prop(name)]));

/**
 * @typedef {{ $option: true, type: string, doc: string, default?: unknown, defaultText?: string, units?: string,
 *   input?: boolean, languages?: "js" | "python", required?: boolean, ts?: string }} ChartOption
 * @typedef {TemplateDefinition & { chart: { summary: string, group: string, use: string[], omit: string[],
 *   usage?: string, options: Record<string, Omit<ChartOption, "$option">>, types?: Record<string, string> } }} ChartDefinition
 */

/**
 * A chart's parameter (TODO 130.4): its options-table type ("column", "channel", "number",
 * "boolean", "string", "color", "object", a union of quoted literals, ...), the sentence its
 * reference page, TypeScript props and Python docstring show, and the options table's other keys
 * (default, defaultText, units, input, languages). `required: true` makes leaving it out an error
 * naming the chart and the option. A Python-only option (languages: "python", a mark's `data`)
 * is not a parameter: Python takes it itself. `ts` is its TypeScript type where the table's type
 * has no TypeScript form of its own (a built-in template's `boolean | LabelBox`).
 * @param {string} type
 * @param {string} doc
 * @param {Partial<Omit<ChartOption, "$option" | "type" | "doc">>} [extra]
 * @returns {ChartOption}
 */
export const option = (type, doc, extra = {}) => ({ $option: true, type, doc, ...extra });

/**
 * A built-in template's refinement of a shared option it takes (TODO 130.5), as the options table
 * writes one: a default, defaultText, doc or units of its own, as Ecdf's `width: refine({ default: 2 })`.
 * @param {Record<string, unknown>} extra
 */
export const refine = (extra) => ({ $refine: true, ...extra });
const REFINED = ["default", "defaultText", "doc", "units", "input"];
/** Signatures defineTemplate has checked, which a definition spread into another keeps. */
const checked = new WeakSet();

/**
 * Declared options, checked, as the options table writes them: { options, required, types }.
 * @param {string} kind
 * @param {Record<string, unknown>} entries
 * @param {{ where: string, who: string, refines: boolean }} context
 */
function declaredOptions(kind, entries, { where, who, refines }) {
  const options = /** @type {Record<string, Record<string, unknown>>} */ ({});
  const required = /** @type {string[]} */ ([]), types = /** @type {Record<string, string>} */ ({});
  for (const [name, entry] of Object.entries(entries ?? {})) {
    const record = /** @type {Record<string, any>} */ (entry);
    if (name.startsWith("_")) throw Error(`${kind}: ${who} options are all public; ${name} is private.`);
    if (refines && record?.$refine) {
      const { $refine, ...table } = record;
      const keys = Object.keys(table);
      if (!keys.length || keys.some((key) => !REFINED.includes(key)))
        throw Error(`${kind}: ${where}.${name} refines a shared option with ${REFINED.join(", ")}; it has ${keys.join(", ") || "none of them"}.`);
      options[name] = table;
      continue;
    }
    if (!record?.$option || typeof record.type !== "string" || typeof record.doc !== "string" || !record.doc)
      throw Error(`${kind}: ${where}.${name} needs option(type, doc)${refines ? " or refine(...)" : ""}, so its reference page and signatures can say what it does.`);
    const { $option, required: needed, ts, ...table } = record;
    options[name] = table;
    if (needed) required.push(name);
    if (ts) types[name] = ts;
  }
  return { options, required, types };
}

/**
 * A built-in template's signature, checked (TemplateSignature).
 * @param {string} kind
 * @param {Record<string, any>} signature
 * @returns {TemplateSignature}
 */
function signatureOf(kind, { tier, group = "Marks", summary, extraProps, use, omit, options, ...rest }) {
  if (typeof summary !== "string" || !summary) throw Error(`${kind}: a signature needs a summary, the sentence its reference page opens with.`);
  for (const key of Object.keys(rest))
    throw Error(`${kind}: a signature takes tier, group, summary, extraProps, use, omit and options, not ${key}.`);
  const declared = declaredOptions(kind, options, { where: "signature.options", who: "a template's", refines: true });
  return {
    ...(tier === undefined ? {} : { tier }), group, summary, ...(extraProps ? { extraProps } : {}),
    ...(use === undefined ? {} : { use }), ...(omit === undefined ? {} : { omit }), ...declared,
  };
}

/**
 * A chart (TODO 130.4): a template over public registry components, whose parameters declare
 * their options, so the generator (scripts/generate-python-signatures.mjs) writes its options
 * entry, TypeScript props, Svelte component, Python signature and reference page from this file
 * alone. `use` and `omit` name the options table's shared sets, which the caller's other props
 * (its rest(), to the main part) take; `usage` is the reference page's prose, in Markdown.
 * @param {{ kind: string, summary: string, group?: string, use?: string[], omit?: string[], usage?: string,
 *   params: Record<string, ChartOption>, label?: string, parts?: string[], root: TemplateNode }} spec
 * @returns {ChartDefinition}
 */
export function defineChart({ kind, summary, group = "Marks", use = [], omit = [], usage, params, ...rest }) {
  if (typeof summary !== "string" || !summary) throw Error(`${kind}: a chart needs a summary, the sentence its reference page opens with.`);
  for (const key of Object.keys(rest))
    if (!["label", "parts", "root"].includes(key))
      throw Error(`${kind}: a chart takes kind, summary, group, use, omit, usage, params, label, parts and root, not ${key}.`);
  const declared = declaredOptions(kind, params, { where: "params", who: "a chart's", refines: false });
  const options = /** @type {Record<string, Omit<ChartOption, "$option">>} */ (declared.options);
  const required = Object.fromEntries(declared.required.map((name) => {
    const doc = /** @type {string} */ (options[name].doc);
    return [name, `${kind} needs ${name}: ${doc[0].toLowerCase()}${doc.slice(1)}`];
  }));
  const defaults = Object.entries(options).filter(([, entry]) => entry.languages !== "python").map(([name, entry]) => [name, entry.default]);
  const definition = defineTemplate({ kind, params: Object.fromEntries(defaults), ...(Object.keys(required).length ? { required } : {}), ...rest });
  const types = Object.keys(declared.types).length ? { types: declared.types } : {};
  return { ...definition, chart: { summary, group, use, omit, ...(usage === undefined ? {} : { usage }), options, ...types } };
}
