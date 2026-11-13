/**
 * The options table (R2.0b): every component's options, in src/lib/scene/options.json.
 *
 * Each option has a type, a default (`default` as a value, or `defaultText` in words), units
 * where they help, one sentence (`doc`), and `languages` when only JavaScript ("js") or only
 * Python ("python") takes it. `setting: true` marks a settings-pane option (the registry's
 * runtimeOptions), which the component passes to its options node rather than declaring as a
 * prop. `input: true` marks an option where a "$name" string reads an input (a channel, a
 * transform's column or choice); elsewhere such a string is literal. A component marked
 * `inputs: "all"` (Mapping) reads them in every value and setting but its name. The registry's
 * stringReads come from these, not from the options' types.
 * A component takes its own `options`, then those of the sets it `use`s (a set may use
 * other sets), less `omit`; an own option named like a set's refines it in place.
 * Component flags `container`, `mark`, `layout` and `passthrough` describe scene behavior
 * (`figure`: a chart of several Plots, which sits where a Plot does and draws its children in
 * one of them, TODO 136.16), and
 * a component flagged `input` is an input (a named value the viewer sets, such as a Slider; the
 * registry's inputs), unlike an option's `input`, which says where a string reads one; one
 * flagged `inputContext` is a scope its inputs are read in (the registry's inputContexts);
 * `positional` names the prop Python's positional arguments set: "value" (Data's table, then
 * its children), "plots" (LinkViews' references) or "text" (Title, Markdown). A container's
 * positional arguments are otherwise its children;
 * `module` supplies the module of a scene-only component absent from the public barrel.
 * Tiers (TODO 137.1, decided in 137.0): a component's `tier` is "charts" (a chart template,
 * bound for hm.charts) or "stats" (a transform template, bound for hm.stats); one without is
 * core. An option's `advanced: true` marks a renderer knob most plots leave alone. Neither
 * changes the API yet: the modules (137.1b, 137.1c) and the docs' order follow them.
 *
 * A chart's entry (TODO 130.4) is not written here: the generator writes options.charts.json from
 * its definition in src/lib/charts/. Nor is a built-in template's (130.5): options.templates.json,
 * from the signature in its definition in src/lib/compound/. Numerical plug-ins' component manifests generate options.plugins.json. The table combines all four.
 * scripts/generate-python-signatures.mjs writes the registry's per-component properties and the
 * stubs' keyword docs from it; the reference pages list it; tests/unit/docs-reference.test.js
 * checks it against the TypeScript types and the components' code.
 */
import core from "./options.json" with { type: "json" };
import templates from "./options.templates.json" with { type: "json" };
import charts from "./options.charts.json" with { type: "json" };
import plugins from "./options.plugins.json" with { type: "json" };

// The built-in templates' and the charts' entries (TODO 130.5, 130.4) are generated from their
// definitions, src/lib/compound/*.js and src/lib/charts/*.js.
const table = { ...core, components: { ...core.components, ...templates, ...charts, ...plugins } };
export const optionsTable = table;

/** The task groups, in reference order. */
export const optionGroups = table.groups;

/** A component's tier: "core", "charts" or "stats". */
export function componentTier(kind) {
  const component = table.components[kind];
  if (!component) throw Error(`options.json has no component ${kind}: add its entry to src/lib/scene/options.json, or a signature to its built-in template's definition`);
  const tier = component.tier ?? "core";
  if (!["core", "charts", "stats"].includes(tier))
    throw Error(`options.json: ${kind}'s tier "${tier}" is not "charts" or "stats" (leave it out for core)`);
  return tier;
}

/** A camelCase option name as Python spells it: snake_case; `for` is target=, `as` is as_=. */
export function pythonName(name) {
  if (name === "as") return "as_";
  if (name === "for") return "target";
  return name.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** A set's options with the sets it uses, in order: name -> [option, set name]. */
function setOptions(names, out = new Map()) {
  for (const name of names ?? []) {
    const set = table.sets[name];
    if (!set) throw Error(`options.json: no set named ${name}`);
    setOptions(set.use, out);
    for (const [option, entry] of Object.entries(set.options ?? {}))
      if (!out.has(option)) out.set(option, [entry, name]);
  }
  return out;
}

/**
 * A component's options, in page order: its own first, then each set's (a set's option that the
 * component refines stays in its set). Each is { name, python, set, type, doc, ... }; `set` is
 * null for the component's own.
 */
export function componentOptions(kind) {
  const component = table.components[kind];
  if (!component) throw Error(`options.json has no component ${kind}`);
  const own = component.options ?? {}, omit = new Set(component.omit ?? []);
  const shared = setOptions(component.use);
  const options = [];
  for (const [name, entry] of Object.entries(own))
    if (!shared.has(name)) options.push({ name, python: pythonName(name), set: null, ...entry });
  for (const [name, [entry, set]] of shared) {
    if (omit.has(name)) continue;
    // A refined default replaces the set's, whichever way either is written.
    const base = own[name] && ("default" in own[name] || "defaultText" in own[name])
      ? Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "default" && key !== "defaultText")) : entry;
    options.push({ name, python: pythonName(name), set, ...base, ...own[name] });
  }
  return options.sort((a, b) => Number(!!a.advanced) - Number(!!b.advanced));
}

// Every camelCase option name the table knows, for docs that mention another option. Read when
// first asked, as the generator replaces the charts' entries after this module loads.
let camelNames;
const knownCamelNames = () => (camelNames ??= new Set([...Object.values(table.sets), ...Object.values(table.components)]
  .flatMap((entry) => Object.keys(entry.options ?? {})).filter((name) => /[a-z][A-Z]/.test(name))));

/** A sentence as a language reads it: Python spells the options it names in snake_case. */
export function inLanguage(text, language) {
  if (language !== "python" || !text) return text;
  const camelNames = knownCamelNames();
  return text.replace(/\b[a-z]+[A-Z]\w*\b/g, (word) => (camelNames.has(word) ? pythonName(word) : word));
}

/** Whether a language ("js" or "python") takes the option. */
export const takes = (option, language) => !option.languages || option.languages === language;

/** Whether a component exists in a language: layout components are Python's only. */
export const componentTakes = (kind, language) => {
  const languages = table.components[kind]?.languages;
  return !languages || languages === language;
};
