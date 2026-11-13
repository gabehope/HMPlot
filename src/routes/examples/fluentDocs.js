// The chained-pipeline doc set (TODO 144): the same docs with every Python data pipeline written
// as a chain, sales.filter(...).group_by(...).agg(...), so an eval can compare agents given these
// docs with agents given the nested-block docs. HMPLOT_DOCS_STYLE=fluent at build time selects
// it (`npm run build:docs-fluent` writes build-fluent/; scripts/generate-patterns.mjs writes the
// skill, eval/agent-tasks/variants/fluent/skill, outside skills/, which the plugin ships).

/** "fluent" or "standard": the doc set the routes build. */
export const docsStyle = () => (process.env.HMPLOT_DOCS_STYLE === "fluent" ? "fluent" : "standard");

/** The transforms' reference pages whose Python example is a chain in the fluent set. */
export const CHAINED = {
  data: "`hm.Data(table)` starts a chain: its methods add the transforms below and return them, and plots or marks draw any step with `data=`.",
  filter: "In a chain: `table.filter(*predicates, inactive=)` returns this Filter; several predicates must all hold.",
  calculate: "In a chain: `table.with_columns(name=expression, ...)` returns this Calculate.",
  group: "In a chain: `table.group_by(*keys).agg(name=reduction, ...)` returns this Group; `group_by()` with no keys is one row of totals, `.len()` counts rows.",
  join: "In a chain: `table.join(other, on=, how=\"left\" | \"inner\", fields=)` returns this Join; `other` is a table, an hm.Data or a chain.",
  sort: "In a chain: `table.sort(*by, descending=False)` returns this Sort.",
};

/** The section the fluent recipes.md and SKILL.md open their data pipelines with. */
export const PIPELINES = `- **Data pipelines are chains, as in polars.** Start from the data, \`sales = hm.Data(df)\` (a
  DataFrame, a dict of columns or an \`hm.Table\`), and
  chain steps; each returns a node that plots or marks draw with \`data=\`:

\`\`\`python
import hmplot as hm

sales = hm.Data({"region": ["N", "S", "N", "S"], "revenue": [120, 80, 150, 60]})
by_region = sales.group_by("region").agg(revenue=hm.col.revenue.sum(), orders=hm.count())
large = sales.filter(hm.col.revenue > 70).with_columns(share=hm.col.revenue / hm.sum("revenue"))
with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(data=by_region):
            hm.charts.Bar(x="region", y="revenue")
        with hm.Plot(data=large):
            hm.Points(x="revenue", y="share")
chart
\`\`\`

- **The steps:** \`filter(*predicates, inactive=)\` (an expression, \`"@brushed"\`, a selection or an
  input comparison; several must all hold), \`with_columns(name=expression)\`,
  \`group_by(*keys).agg(name=reduction)\` (\`group_by()\` with no keys is one row of totals;
  \`.len()\` counts rows), \`join(other, on=, how="left" | "inner", fields=)\` and
  \`sort(*by, descending=False)\`. Reductions are \`hm.sum("x")\` or \`hm.col.x.sum()\`: \`sum\`,
  \`mean\`, \`min\`, \`max\`, \`count\`, \`median\`, \`std\`, \`var\`, \`first\`, \`last\`; with \`by=\`,
  each row gets its group's value. \`.alias("name")\` names an output passed positionally.
- **A chain runs live in the browser, on the GPU.** It recomputes as brushes, selections and
  inputs change, so Python cannot read its rows (no \`to_pandas\`, no \`len\`): prepare static data
  with pandas or polars before \`hm.Data\`. Build chains anywhere (at the top of the program); the
  scene that draws one includes it. Plots can draw the same chain, and branches of one
  \`hm.Data\` share its interaction state: a brush on \`data=sales\` is the one
  \`sales.filter("@brushed")\` keeps. pandas' names (\`groupby\`, \`assign\`, \`merge\`, \`query\`)
  raise errors that name these.
- **Export the Scene, including its pipelines.** Use an explicit \`with hm.Scene() as chart:\`
  around the views and export \`chart\`. Exporting only a Plot or Row leaves out detached
  pipelines outside that subtree. \`hm.Plot(data=chain)\` supplies it to all marks inside;
  use a mark's \`data=\` to override it for that mark, or \`hm.Data(value=...)\` for a branch.`;

/**
 * SKILL.md for the fluent set: the standard SKILL.md with its data-pipeline guidance rewritten as
 * chains. Each pair must match the standard text exactly (generate-patterns.mjs fails when one
 * does not), so the two sets differ only here.
 */
export const SKILL_REPLACEMENTS = [
  ["  `hm.literal(\"x\")` forces a constant, `hm.col.x` a column (an error when it is missing). A\n  transform gives its children a new table; its siblings keep the original.",
    "  `hm.literal(\"x\")` forces a constant, `hm.col.x` a column (an error when it is missing).\n" + PIPELINES],
  ["  is a Group without `by`: one row, `count` 0 when nothing is selected.",
    "  is `table.group_by().agg(...)`: one row, `count` 0 when nothing is selected."],
  ["  Retain them in `hm.Calculate(columns={\"index\": hm.row(), \"noise\": hm.random(seed=7)})`",
    "  Retain them with `.with_columns(index=hm.row(), noise=hm.random(seed=7))`"],
  ["  `\"@hovered\"` in a Filter's `where=` or a channel;", "  `\"@hovered\"` in `.filter(\"@hovered\")` or a channel;"],
  ["- **One pipeline, several plots.** A transform node is a data source: `totals = hm.Group(...)`\n  inside its Data, then `hm.Points(data=totals, ...)` in any Plot of the scene (or\n  `hm.Data(value=totals)`). It runs once and every plot reads its live output.",
    "- **One pipeline, several plots.** A chain step is a data source: `totals = sales.group_by(...).agg(...)`,\n  then `hm.Points(data=totals, ...)` in any Plot of the scene. It runs once and every plot reads\n  its live output."],
  ["aggregate rows first (hm.Group) when\n  there are several per bar.", "aggregate rows first (`.group_by(...).agg(...)`)\n  when there are several per bar."],
  ["  tooltip names with `hm.Group(by=[\"origin\", \"lon\", \"lat\", \"name\"], columns={\"flights\": hm.count()})`\n  before `Points`.",
    "  tooltip names with `flights.group_by(\"origin\", \"lon\", \"lat\", \"name\").agg(departing=hm.count())`\n  as the `Points`' data."],
  ["  event brushes highlight their groups. Keep the event histogram outside Group;",
    "  event brushes highlight their groups. Draw the event histogram from the events, not the groups;"],
  ["  `hm.Filter(where=\"@brushed\")` around another view follows it.",
    "  `table.filter(\"@brushed\")` as another view's `data=` follows it."],
  ["  `where=[the_other_selections]`.", "  `.filter(*the_other_selections)`."],
  ["- **Click drilldowns:** keep source rows in one Data; Group by region in the selectable branch,\n  then Filter(where=focus, inactive=\"all\") before Group by product in the target branch",
    "- **Click drilldowns:** keep source rows in one Data: `sales.group_by(\"region\")` for the selectable\n  bars, and `sales.filter(focus, inactive=\"all\").group_by(\"product\")` for the target"],
];

/** The fluent SKILL.md from the standard one; throws naming a replacement whose text is gone. */
export function fluentSkill(standard) {
  let text = standard;
  for (const [from, to] of SKILL_REPLACEMENTS) {
    if (!text.includes(from)) throw Error(`skills/hmplot/SKILL.md no longer has the text the fluent skill rewrites (fluentDocs.js): ${JSON.stringify(from.slice(0, 80))}`);
    text = text.replace(from, to);
  }
  return text;
}

/** translation.md's pipeline rows in the fluent set: the chain methods beside the components. */
export const TRANSLATION_REPLACEMENTS = [
  ["| `Filter(where=hm.col.x > 0)` | transform · filter |", "| `table.filter(hm.col.x > 0)` (`Filter`) | transform · filter |"],
  ["| `Group(by=[\"region\"], columns={\"total\": hm.sum(\"x\")})` | transform · group |", "| `table.group_by(\"region\").agg(total=hm.sum(\"x\"))` (`Group`) | transform · group |"],
  ["| `Calculate(columns={\"ratio\": hm.col.a / hm.col.b})` | transform · calculate |", "| `table.with_columns(ratio=hm.col.a / hm.col.b)` (`Calculate`) | transform · calculate |"],
  ["| `Join(data=other, on=\"id\")` | transform · join |", "| `table.join(other, on=\"id\")` (`Join`) | transform · join |"],
  ["| `Sort(by=\"x\", order=\"desc\")` | transform · sort |", "| `table.sort(\"x\", descending=True)` (`Sort`) | transform · sort |"],
  ["| reusing a computed table in several charts | `totals = hm.Group(...)` then `data=totals` |", "| reusing a computed table in several charts | `totals = sales.group_by(...).agg(...)` then `data=totals` |"],
];

/** The fluent translation.md from the standard one; throws naming a replacement whose text is gone. */
export function fluentTranslation(standard) {
  let text = standard;
  for (const [from, to] of TRANSLATION_REPLACEMENTS) {
    if (!text.includes(from)) throw Error(`skills/hmplot/translation.md no longer has the text the fluent set rewrites (fluentDocs.js): ${JSON.stringify(from.slice(0, 80))}`);
    text = text.replace(from, to);
  }
  return text;
}

const NESTED = /\bwith hm\.(Filter|Group|Calculate|Join|Sort)\(/;
/**
 * In the fluent set, a page whose Python builds a pipeline from nested blocks says, under its
 * title, that the chain builds the same transforms (the pages are not rewritten one by one).
 * Svelte pages (python false) and the standard set pass through.
 */
export function nestedNote(text, python = true) {
  if (docsStyle() !== "fluent" || !python || !NESTED.test(text)) return text;
  const note = "> This page builds pipelines from nested blocks (`with hm.Filter(...):`). A chain builds the same transforms and is how the recipes write them: `table.filter(...)`, `.with_columns(...)`, `.group_by(...).agg(...)`, `.join(...)`, `.sort(...)` (recipes.md, Data pipelines).";
  return text.replace(/^(# .*\n)/, `$1\n${note}\n`);
}
