// The docs as Markdown, for agents and other readers of plain text (R2.5): every guide, reference
// and example page as a .md file beside its HTML page (/docs/start.md, /reference/python/points.md,
// /examples/violin.md), llms.txt (one line per page), llms-full.txt (every guide and reference page)
// and the API on one page (/reference/api.md, from the Python package's registry.json and
// signatures.json). They are built from the HTML pages' own sources (the guide and reference
// Markdown, the options table, the example programs), so they change with them. The routes'
// +server.js files serve them; the build prerenders them as files.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { apiDocs, apiGroups, guideSections } from "./docsManifest.js";
import { examples as catalog } from "./catalog.js";
import { referenceLink } from "./referenceLinks.js";
import { referenceOptions } from "./referenceOptions.js";
import { componentOptions, componentTier, optionsTable } from "../../lib/scene/options.js";
import { CHAINED, PIPELINES, docsStyle, nestedNote } from "./fluentDocs.js";

const read = (root, file) => { try { return readFileSync(path.resolve(root, file), "utf8"); } catch { return ""; } };
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
/** The reference entries with a page of their own (moved ids render another's: left out). */
export const referenceEntries = () => apiDocs.filter((entry) => !entry.hidden);
const REFERENCE_TIERS = [["core", "Core"], ["charts", "Chart patterns"], ["stats", "Statistical patterns"]];
const referenceTier = entry => entry.component ? componentTier(entry.component) : "core";
/** The example programs src/examples/<id>/ holds: {python, svelte}, "" for a missing one. */
const program = (root, id) => ({ python: read(root, `src/examples/${id}/${id}.py`), svelte: read(root, `src/examples/${id}/${id}.svelte`) });
const fence = (language, code) => {
  const text = code.replace(/\s+$/, "");
  // A fence longer than any backtick run inside the code.
  const ticks = "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks}${language}\n${text}\n${ticks}`;
};

// Internal links as the Markdown pages give them: to the Markdown page (an anchor is kept).
function markdownLink(url) {
  const match = /^(\/(?:docs|examples|reference\/(?:svelte|python))\/[a-z0-9-]+)(#[^)\s]*)?$/.exec(url);
  return match ? `${match[1]}.md${match[2] ?? ""}` : url;
}

/**
 * Markdown as the site serves it under its `base` path (svelte.config.js kit.paths.base, /HMPlot
 * on GitHub Pages): each root-relative link's URL prefixed, outside code blocks and code spans.
 * The routes apply it; the agent skill's copies (scripts/build-llm-docs.mjs) keep their links.
 * @param {string} text
 * @param {string} base
 */
export function withBase(text, base) {
  if (!base) return text;
  let open = null;
  return text.split("\n").map((line) => {
    const marker = /^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) { if (marker && marker[1][0] === open[0] && marker[1].length >= open.length && !marker[2].trim()) open = null; return line; }
    if (marker) { open = marker[1]; return line; }
    return line.split(/(`+[^`]*`+)/).map((part, i) => i % 2 ? part : part.replace(/\]\((\/(?!\/)[^)\s]*)\)/g, (_, url) => `](${base}${url})`)).join("");
  }).join("\n");
}

/**
 * A guide or reference page's prose (its .svx or .md source) as plain Markdown: front matter
 * dropped, a python example fence and its svelte fence kept as two code blocks (without the
 * docs' line highlights), Note and Warning as quotes, Columns' cells in order, Math as $...$,
 * <Example id> as its two programs, and on guide pages the API names written [Points] linked to
 * their reference. Internal links point at the Markdown pages.
 * @param {string} source
 * @param {{guide?: boolean, root?: string}} [options]
 */
export function proseMarkdown(source, { guide = false, root = process.cwd() } = {}) {
  const body = source.replace(FRONT_MATTER, "");
  const defined = new Set([...body.matchAll(/^\s{0,3}\[([^\]]+)\]:\s/gm)].map((m) => m[1].toLowerCase()));
  const out = [];
  let open = null, quotes = 0, script = false;
  const push = (line) => out.push(quotes ? (line ? `> ${line}` : ">") : line);
  // Links in a line outside code spans: [Name] on a guide page, internal URLs everywhere.
  const inline = (line) => line.split(/(`+[^`]*`+)/).map((part, i) => i % 2 ? part : part
    .replace(/\]\((\/[^)\s]+)\)/g, (_, url) => `](${markdownLink(url)})`)
    .replace(/\[([A-Za-z_][\w.]*(?: [A-Za-z_]+)*)\](?![(\[:])/g, (match, name) => {
      if (!guide || defined.has(name.toLowerCase())) return match;
      const url = referenceLink(name);
      return url ? `[${name}](${url}.md)` : match;
    })).join("");
  for (const line of body.split(/\r?\n/)) {
    const marker = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      push(line);
      if (marker && marker[2][0] === open[0] && marker[2].length >= open.length && !marker[3].trim()) open = null;
      continue;
    }
    if (marker) {
      open = marker[2];
      // The language only: "python example {2,4}" and "svelte {6}" are the docs' own.
      push(`${marker[1]}${marker[2]}${marker[3].trim().split(/\s+/)[0] ?? ""}`);
      continue;
    }
    if (script) { if (/<\/script>/.test(line)) script = false; continue; }
    if (/^\s*<script[\s>]/.test(line)) { script = !/<\/script>/.test(line); continue; }
    const note = /^\s*<(Note|Warning)(?:\s+title="([^"]*)")?\s*>\s*$/.exec(line);
    if (note) { if (out.at(-1)) push(""); quotes++; push(`**${note[2] ?? note[1]}**`); continue; }
    if (/^\s*<\/(Note|Warning)>\s*$/.test(line)) {
      while (out.at(-1) === ">") out.pop();
      quotes = Math.max(0, quotes - 1);
      continue;
    }
    if (/^\s*<\/?Columns(\s[^>]*)?>\s*$/.test(line)) continue;
    const example = /^\s*<Example\s+id="([^"]+)"[^>]*\/>\s*$/.exec(line);
    if (example) {
      const { python, svelte } = program(root, example[1]);
      for (const [language, code] of [["python", python], ["svelte", svelte]]) if (code) push(fence(language, code)), push("");
      continue;
    }
    push(inline(line
      .replace(/<Math\s+tex="([^"]*)"\s+display\s*\/>/g, (_, tex) => `$$${tex}$$`)
      .replace(/<Math\s+tex="([^"]*)"\s*\/>/g, (_, tex) => `$${tex}$`)
      .replace(/<\/?div>/g, "")));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A guide page as Markdown: its title, its summary and its prose. */
export function guideMarkdown(id, { root = process.cwd() } = {}) {
  const page = guideSections.find((entry) => entry.id === id);
  if (!page) return null;
  return nestedNote([`# ${page.title}`, page.summary, proseMarkdown(read(root, page.file), { guide: true, root })]
    .filter(Boolean).join("\n\n") + "\n");
}

// A default as the language writes it (OptionsList.svelte's literal).
function literal(value, python) {
  if (Array.isArray(value)) return `[${value.map((item) => literal(item, python)).join(", ")}]`;
  if (value === null) return python ? "None" : "null";
  if (typeof value === "boolean") return python ? (value ? "True" : "False") : String(value);
  return JSON.stringify(value);
}

/** One option as a list item, with what OptionsList.svelte shows: its type, sentence, default, units. */
function optionLine(option, python) {
  const numeric = [option.default].flat().every((item) => typeof item === "number");
  const parts = [option.doc];
  if (option.default !== undefined) parts.push(`Default: \`${literal(option.default, python)}\`${option.units && numeric ? ` ${option.units}` : ""}.`);
  if (option.defaultText) parts.push(`Default: ${option.defaultText}.`);
  if (option.units && !(option.default !== undefined && numeric)) parts.push(`In ${option.units}.`);
  if (option.required) parts.push("Required.");
  // The type in code: a TypeScript type (Record<string, unknown>) is not HTML.
  return `- \`${option.name}\` (\`${option.type ?? "any"}\`${option.setting ? ", setting" : ""}): ${parts.filter(Boolean).join(" ")}`;
}

// The option sets the Mark options page describes (the marks' shared options): with `inFull`, a
// component's page names them and lists only the ones it refines.
const setsOf = (names) => names.flatMap((name) => [name, ...setsOf(optionsTable.sets[name].use ?? [])]);
const MARK_OPTIONS = apiDocs.find((entry) => entry.id === "mark-options");
const markSets = new Set(setsOf(MARK_OPTIONS?.sets ?? []));

/**
 * A reference page in a language ("python" or "svelte") as Markdown, as its HTML page shows it:
 * title and summary, the example (the language's program; the other's when it has none), the
 * options or parameters, the prose and the related examples. `inFull` is the page in
 * llms-full.txt: the example in both languages, and of the marks' shared options only the names
 * (the Mark options page in the same file describes them) and those the component refines.
 */
export function referenceMarkdown(id, language, { root = process.cwd(), inFull = false } = {}) {
  const entry = apiDocs.find((item) => item.id === id);
  if (!entry || !["python", "svelte"].includes(language)) return null;
  const python = language === "python", lang = python ? "python" : "js";
  const lines = [`# ${python ? entry.pythonTitle ?? entry.title : entry.title}`];
  if (entry.summary) lines.push(entry.summary);
  if (entry.languages && entry.languages !== lang)
    lines.push(entry.languages === "python" ? "Python only. Svelte pages lay this out with HTML and CSS." : "JavaScript only.");
  const page = entry.aliasOf ?? entry.id, pair = program(root, `${page}-basic`);
  // The chained-pipeline doc set (TODO 144): the transforms' Python examples as chains.
  const chained = python && docsStyle() === "fluent" && CHAINED[page];
  if (chained) {
    pair.python = read(root, `src/recipes/fluent/reference/${page}.py`) || pair.python;
    lines.push(chained);
  }
  const sources = pair.python || pair.svelte ? pair : { python: entry.python ?? "", svelte: entry.svelte ?? "" };
  const shown = sources[language] ? language : sources.svelte ? "svelte" : "python";
  const other = shown === "python" ? "svelte" : "python";
  if (sources[shown]) lines.push("## Example", fence(shown, sources[shown]));
  if (inFull && sources[other]) lines.push(fence(other, sources[other]));
  const options = referenceOptions(entry, lang);
  if (options.sections.length) {
    lines.push(`## ${options.heading}`);
    if (options.javascriptMembers && python)
      lines.push("This table describes the JavaScript interface. Python has its own Node and resource methods, listed under “Python members” below; these member names are not Python method names.");
    if (options.component && python) lines.push("Keywords are snake_case.");
    const own = optionsTable.components[entry.component]?.options ?? {};
    const sets = new Map(entry.component ? componentOptions(entry.component).map((option) => [option.name, option.set]) : []);
    const named = (option) => inFull && markSets.has(sets.get(option.key)) && !own[option.key];
    for (const section of options.sections) {
      if (options.sections.length > 1 || section.title !== options.heading) lines.push(`### ${section.title}`);
      const listed = section.options.filter((option) => !named(option)), names = section.options.filter(named);
      if (listed.length) lines.push(listed.map((option) => optionLine(option, python)).join("\n"));
      if (names.length) lines.push(`${listed.length ? "Also these" : "These"} options the marks share (described on Mark options): ${names.map((option) => `\`${option.name}\``).join(", ")}.`);
    }
  }
  const prose = proseMarkdown(read(root, `src/routes/content/reference/${page}.svx`), { root });
  if (prose) lines.push(prose);
  const related = (entry.examples ?? []).map((name) => [name, catalog.find((item) => item.id === name)?.title ?? name]);
  if (related.length) lines.push("## Related examples", related.map(([name, title]) => `- [${title}](/examples/${name}.md)`).join("\n"));
  return nestedNote(lines.join("\n\n") + "\n", python);
}

/**
 * A gallery example's page as Markdown: its title, description and programs (a program pair's
 * from src/examples, else the catalog's Svelte and its Python equivalent when it has one).
 * `pythonExamples` is pythonExamples.js's map (Vite imports it; the routes pass it).
 */
export function exampleMarkdown(id, { root = process.cwd(), pythonExamples = {} } = {}) {
  const item = catalog.find((entry) => entry.id === id);
  if (!item) return null;
  const pair = program(root, id);
  const python = pair.python || pythonExamples[id] || item.python || "", svelte = pair.python ? pair.svelte : item.code ?? "";
  const lines = [`# ${item.title}`, item.description];
  if (python) lines.push("## Python", fence("python", python));
  if (svelte) lines.push("## Svelte", fence("svelte", svelte));
  return nestedNote(lines.filter(Boolean).join("\n\n") + "\n");
}

const SECTION_TITLES = { introduction: "Introduction", tutorial: "Tutorial", guides: "Guides" };
const summaryOf = (text) => (text ?? "").replace(/\s+/g, " ").trim();
// Shared by both doc sets: pipeline syntax is the experimental variable, not these rules.
const COMPOSITION_NOTES = `## Before composing a chart

- Prefer explicit expression operands: \`hm.col.delay\` reads a field and \`hm.literal("red")\`
  is a constant. For example, \`hm.where(hm.view.brushed, hm.literal("red"), hm.literal("gray"))\`.
  State is \`hm.view.any_brushed\` or \`"@any_brushed"\`, never \`hm.col("@any_brushed")\`.
- A transform produces a new table; its siblings retain their input. Draw a saved output with
  \`hm.Plot(data=output)\` for all its descendant marks, a mark's \`data=output\` for that
  mark alone, or \`hm.Data(value=output)\` around a branch. Use a live Join to attach grouped
  statistics to geometry from another table; its right-side keys must be unique (\`reference/python/join.md\`).
- Put shared pipelines and their views in an explicit \`hm.Scene() as chart\`, and export
  \`chart\`. A Plot or Row export excludes pipelines outside its subtree, including detached
  chains adopted by its scene. See \`reference/python/data.md\` for the export boundary.
- Brush a source outside its own selection filter. Independent crossfilter controls need
  separate selections; each view filters by the other controls' selections. Keep repeated
  locations grouped before drawing; selection still refers to their contributing rows.
- To wrap sensor categories into six columns, use \`hm.Facet(column="sensor", wrap=6)\`.
  To cross regions with sensors use \`row="region", column="sensor"\`; for wide measurement
  columns use \`fields=[...]\` and the cell's \`value\` column. Use \`hm.Panels\` for separately
  authored plots aligned over one shared x (\`reference/python/facet.md\`, \`panels.md\`).
- Numeric Text accepts numeric columns directly, with \`format=\".2f\"\`. Use Title inside Data
  for live readouts, EndLabels for series endpoints, and RuleX/RuleY or BandX/BandY for
  references that follow the other axis without widening its domain.`;

/**
 * llms.txt (llmstxt.org): what the library is, then one line per page, linking its Markdown: the
 * guide, the Python and the Svelte reference (each without the other language's own pages), and
 * the examples.
 */
/**
 * The recipes (TODO 136.5): short, tested Python programs for the charts asked for most, each a
 * src/recipes/*.py file whose docstring is its title line and a caption. recipes.md is the first
 * page llms.txt and the skill point an agent at; tests/test_recipes.py renders every recipe.
 */
export function recipeList({ root = process.cwd(), style = docsStyle() } = {}) {
  let files = [];
  try { files = readdirSync(path.resolve(root, "src/recipes")).filter((name) => name.endsWith(".py")).sort(); } catch { return []; }
  return files.map((name) => {
    // The chained-pipeline doc set (TODO 144) takes src/recipes/fluent/<name> where there is one.
    const source = (style === "fluent" && read(root, `src/recipes/fluent/${name}`)) || read(root, `src/recipes/${name}`);
    const [, docstring = "", code = source] = /^"""([\s\S]*?)"""\n([\s\S]*)$/.exec(source) ?? [];
    const [title = name, ...caption] = docstring.trim().split("\n");
    return { id: name.replace(/^\d+_/, "").replace(/\.py$/, ""), title: title.trim(), caption: caption.join(" ").trim(), code: code.trim() };
  });
}
/**
 * The agent skill's patterns.md, generated from the same recipes (scripts/generate-patterns.mjs):
 * the skill works offline, and its Python programs run in pytest (test_api_consistency.py,
 * test_animation.py).
 */
export function patternsMarkdown({ root = process.cwd(), style = docsStyle() } = {}) {
  const lines = ["# HMPlot patterns",
    "Generated from src/recipes (scripts/generate-patterns.mjs); edit the recipes, not this file. Each program is complete: it runs as a notebook cell (its last line displays the chart) and with `hmplot check program.py`, and the repository's tests render every one. Svelte takes the same components and options in camelCase; each component's `reference/svelte/<name>.md` page opens with a Svelte program."];
  lines.push(COMPOSITION_NOTES);
  if (style === "fluent") lines.push("## Data pipelines", PIPELINES);
  recipeList({ root, style }).forEach((recipe, index) =>
    lines.push(`## ${index + 1}. ${recipe.title}`, recipe.caption, "```python\n" + recipe.code + "\n```"));
  return lines.filter(Boolean).join("\n\n") + "\n";
}
export function recipesMarkdown({ root = process.cwd(), style = docsStyle() } = {}) {
  const lines = ["# Recipes",
    "Short Python programs for the charts asked for most, each rendered by the test suite. Start from the closest one; every component's page is linked from [llms.txt](/llms.txt). In Svelte the same components take the same options in camelCase."];
  lines.push(COMPOSITION_NOTES);
  if (style === "fluent") lines.push("## Data pipelines", PIPELINES);
  for (const recipe of recipeList({ root, style }))
    lines.push(`## ${recipe.title}`, recipe.caption, "```python\n" + recipe.code + "\n```");
  return lines.filter(Boolean).join("\n\n") + "\n";
}

/** @param {{guide?: boolean}} [options] `guide: false` leaves the user guide out (guide.js). */
export function llmsIndex({ guide = true } = {}) {
  const line = (title, url, summary) => `- [${title}](${url})${summary ? `: ${summaryOf(summary)}` : ""}`;
  const out = [
    "# HMPlot",
    "> Composable WebGPU plots for Svelte 5 and Python notebooks: marks, named data, scales, transforms and interaction, in 2D and 3D, with maps, graphs and simulations.",
    "Each page below is Markdown; the HTML page has the same address without `.md`. [llms-full.txt](/llms-full.txt) has every guide and reference page in one file, and [the API on one page](/reference/api.md) lists each component's Python keywords and Svelte props.",
    "## Start here",
    [line("Recipes", "/recipes.md", "tested Python programs for the common charts (scatter, lines over time, bars, distributions, facets, annotations, linked brushing, sliders, animation, maps, 3D, a million points, export): start from the closest one"),
      ...(docsStyle() === "fluent" ? ["  - Data pipelines: hm.Data(df).filter(...).group_by(...).agg(...), chained as in polars"] : []),
      ...recipeList().map((recipe) => `  - ${recipe.title}`)].join("\n"),
  ];
  for (const section of guide ? Object.keys(SECTION_TITLES) : []) {
    const pages = guideSections.filter((page) => page.section === section);
    if (pages.length) out.push(`## ${SECTION_TITLES[section]}`, pages.map((page) => line(page.title, `/docs/${page.id}.md`, page.summary)).join("\n"));
  }
  for (const [language, title, other] of [["python", "Python reference", "js"], ["svelte", "Svelte reference", "python"]]) {
    const entries = referenceEntries().filter((entry) => entry.languages !== other);
    for (const [tier, label] of REFERENCE_TIERS) {
      const lines = apiGroups.flatMap((group) => entries.filter((entry) => entry.group === group && referenceTier(entry) === tier)
        .map((entry) => line(language === "python" ? entry.pythonTitle ?? entry.title : entry.title, `/reference/${language}/${entry.id}.md`, entry.summary)));
      out.push(`## ${title}: ${label}`, lines.join("\n"));
    }
  }
  out.push("## Examples", catalog.map((item) => line(item.title, `/examples/${item.id}.md`, item.description)).join("\n"));
  out.push("## Optional", [line("llms-full.txt", "/llms-full.txt", "every guide and reference page as Markdown, in one file"),
    line("API on one page", "/reference/api.md", "each component's Python signature and Svelte props, from the Python package's registry")].join("\n"));
  return out.join("\n\n") + "\n";
}

/**
 * llms-full.txt: the guide, then the reference, every page as its Markdown. A reference page is in
 * Python, with its Svelte example too (a JavaScript-only page in JavaScript), and names the marks'
 * shared options that the Mark options page describes. Each page's headings move down one level
 * under a heading of its own, with the page's address.
 */
export function llmsFull({ root = process.cwd(), guide = true } = {}) {
  const nest = (text, url) => text.replace(/^(#{1,5}) /gm, "#$1 ").replace(/^## (.*)$/m, `## $1\n\nPage: ${url}`);
  const out = ["# HMPlot documentation", "The guide, then the reference: every page of the documentation as Markdown. A reference page is in Python, with its example in Svelte too; Svelte spells the same options in camelCase (fill_scale is fillScale), and its page is at the same address with svelte for python. /reference/api.md has every component's Python signature and Svelte props on one page."];
  for (const section of guide ? Object.keys(SECTION_TITLES) : [])
    for (const page of guideSections.filter((item) => item.section === section))
      out.push(nest(guideMarkdown(page.id, { root }), `/docs/${page.id}.md`));
  for (const [tier] of REFERENCE_TIERS)
    for (const group of apiGroups)
    for (const entry of referenceEntries().filter((item) => item.group === group && referenceTier(item) === tier)) {
      const language = entry.languages === "js" ? "svelte" : "python";
      out.push(nest(referenceMarkdown(entry.id, language, { root, inFull: true }), `/reference/${language}/${entry.id}.md`));
    }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/**
 * The API on one page (R2.5), from the Python package's registry.json (the components, their
 * groups and props) and signatures.json (each component's Python keywords and types), with the
 * options table's one-line summaries: per group, each component's Python signature and Svelte props.
 */
export function apiMarkdown({ root = process.cwd() } = {}) {
  const registry = JSON.parse(read(root, "python/hmplot/registry.json"));
  const signatures = JSON.parse(read(root, "python/hmplot/signatures.json"));
  const pythonNames = { LayoutGrid: "Grid" };
  // An entry's reference pages, in the languages it is in.
  const pages = (entry) => [["Python", "python", "js"], ["Svelte", "svelte", "python"]].filter(([, , other]) => entry.languages !== other)
    .map(([label, language]) => `[${label}](/reference/${language}/${entry.id}.md)`).join(", ");
  const out = ["# HMPlot API on one page",
    "Every component: its summary, its Python signature (`import hmplot as hm`; keywords are snake_case and all optional unless the reference says otherwise) and its Svelte props (camelCase). Generated from the Python package's registry and signatures; the reference pages (linked) have each option's description and default. Python containers take their children positionally or in a `with` block; Svelte components take them as child markup."];
  const names = Object.keys(registry.components);
  for (const [tier, label] of REFERENCE_TIERS)
  for (const group of apiGroups) {
    const members = names.filter((name) => registry.components[name].group === group && componentTier(name) === tier);
    if (!members.length) continue;
    out.push(`## ${label}: ${group}`);
    for (const name of members) {
      const component = registry.components[name], summary = optionsTable.components[name]?.summary;
      const python = (["charts", "stats"].includes(component.tier) ? component.tier + "." : "") + (pythonNames[name] ?? name), entry = apiDocs.find((item) => item.component === name && !item.hidden);
      const languages = optionsTable.components[name]?.languages;
      const lines = [`### ${python === name ? name : `${name} (Python: ${python})`}`];
      if (summary) lines.push(summary);
      // As the stubs declare it: positional children (or LinkViews' plots, or Title's text), then
      // keywords; typing's Literal as Literal.
      const keywords = Object.entries(signatures[name] ?? {}).map(([key, type]) => `    ${key}: ${type.replace(/TypingLiteral\[/g, "Literal[")} = ...,`);
      const positional = name === "LinkViews" ? "*plots" : ["Title", "Markdown"].includes(name) ? "text, /" : component.container ? "*children" : null;
      const head = positional ? (positional.startsWith("*") ? `${positional},` : `${positional}, *,`) : "*,";
      if (languages !== "js" && (signatures[name] || component.layout || component.passthrough))
        lines.push(fence("python", keywords.length ? `hm.${python}(${head}\n${keywords.join("\n")}\n)` : `hm.${python}(${positional?.startsWith("*") ? positional : ""})`));
      const props = component.properties ?? [];
      if (["charts", "stats"].includes(component.tier)) lines.push(`Svelte import: \`import { ${name} } from "hmplot/${component.tier}";\``);
      if (languages !== "python" && name !== "Markdown")
        lines.push(`Svelte: \`<${name}${props.length ? ` ${props.join(" ")}` : ""}${component.container ? ">…</" + name + ">" : " />"}\``);
      if (component.runtimeOptions?.length) lines.push(`Settings (the settings pane's options, also accepted as props): ${component.runtimeOptions.map((option) => `\`${option}\``).join(", ")}.`);
      if (entry) lines.push(`Reference: ${pages(entry)}.`);
      out.push(lines.join("\n\n"));
    }
  }
  const functions = referenceEntries().filter((entry) => !entry.component);
  out.push("## Functions, resources and types", functions.map((entry) =>
    `- ${entry.pythonTitle && entry.pythonTitle !== entry.title ? `${entry.title} (Python: ${entry.pythonTitle})` : entry.title}: ${summaryOf(entry.summary)} ${pages(entry)}`).join("\n"));
  return out.join("\n\n") + "\n";
}
