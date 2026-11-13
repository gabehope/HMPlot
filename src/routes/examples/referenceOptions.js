// A reference page's options (TODO 68.1), for its HTML page (docsPages.js, OptionsList.svelte) and
// its Markdown (docsMarkdown.server.js).
import { componentOptions, inLanguage, optionsTable, pythonName, takes } from "../../lib/scene/options.js";
import types from "../content/reference/types.json" with { type: "json" };

// A reference page's options in a language ("js" or "python"): a component's from the options
// table, a set's (the mark options), a TypeScript type's members (types.json), or an entry's
// parameters, grouped as OptionsList.svelte shows them, named and described as the language
// spells them.
export function referenceOptions(entry, lang) {
  const javascriptMembers = ["PlotHandle", "TransformHandle", "DataIdentity", "SelectionResource"].includes(entry.type);
  const spell = lang === "python" && !javascriptMembers;
  const shown = (option) => ({ key: option.name, name: spell ? option.python : option.name, type: option.type,
    doc: inLanguage(option.doc, spell ? "python" : "js"), default: option.default, defaultText: option.defaultText,
    units: option.units, required: option.required, setting: option.setting });
  let sections = [];
  if (entry.component) {
    const grouped = new Map();
    for (const option of componentOptions(entry.component).filter((option) => takes(option, lang))) {
      const title = option.advanced ? "Advanced renderer options" : option.set ? optionsTable.sets[option.set].title : "Options";
      if (!grouped.has(title)) grouped.set(title, []);
      grouped.get(title).push(shown(option));
    }
    sections = [...grouped].map(([title, list]) => ({ title, options: list }));
  } else if (entry.sets) {
    const seen = new Set();
    const visit = (set) => {
      const definition = optionsTable.sets[set];
      for (const used of definition.use ?? []) visit(used);
      const list = Object.entries(definition.options ?? {}).filter(([option]) => !seen.has(option))
        .map(([option, value]) => { seen.add(option); return { name: option, python: pythonName(option), ...value }; });
      if (list.length) sections.push({ title: definition.title, options: list.filter((option) => takes(option, lang)).map(shown) });
    };
    entry.sets.forEach(visit);
  } else {
    // An entry's own rows (its parameters, or the functions of a grouped page), after its type's
    // members when it has both.
    const own = entry.props?.length ? [{ title: entry.propsTitle ?? "Parameters", options: entry.props.map((prop) =>
      shown({ name: prop.name, python: prop.python ?? pythonName(prop.name), type: prop.type, doc: prop.description })) }] : [];
    sections = [...[entry.type ?? []].flat().map((type) => ({
      title: [entry.type].flat().length > 1 ? type : "Members",
      options: types[type].members.map((member) => shown({ name: member.name, python: pythonName(member.name), type: member.type, doc: member.doc, required: member.required })),
    })), ...own];
  }
  return { sections, heading: entry.component || entry.sets ? "Options" : entry.type ? "Members" : entry.propsTitle ?? "Parameters",
    javascriptMembers, component: Boolean(entry.component) };
}
