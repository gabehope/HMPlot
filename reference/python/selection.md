# selection

A set of selected rows that marks set and read, shared across marks and plots.

## Example

```python
focus = hm.selection()
hm.Points(x="x", y="y", select=focus, respond=focus)
```

## Members

This table describes the JavaScript interface. Python has its own Node and resource methods, listed under “Python members” below; these member names are not Python method names.

- `isSelection` (`true`): Required.
- `active` (`boolean`): Required.
- `by` (`string | null`): The column the selection matches rows by (selection({by: "gene"})): every row with a value the selected rows have is a member, in any table with that column; null for row identity. Required.
- `revision` (`number`): Required.
- `status` (`() => { active: boolean; previewActive: boolean; count: number; revision: number; previewRevision: number; membership: number; }`): `membership` counts changes of the selected rows; committing a preview (the same rows) bumps `revision` but not `membership`. Required.
- `subscribe` (`(listener: (status: { active: boolean; previewActive: boolean; count: number; revision: number; previewRevision: number; membership: number; }) => void) => () => void`): Required.
- `rows` (`(owner?: DataIdentity | undefined, phase?: "committed" | "preview" | undefined) => Set<number>`): Required.
- `getConstraints` (`(owner?: DataIdentity | undefined, phase?: "committed" | "preview" | undefined) => SelectionConstraint[]`): Required.
- `clearColumns` (`(owner: string | string[] | DataIdentity, columns?: string | string[] | { identity: string; }[] | undefined) => SelectionResource`): Required.
- `replace` (`(owner: DataIdentity | Iterable<number>, rows?: Iterable<number> | undefined, options?: { phase?: "committed" | "preview" | undefined; activate?: boolean | undefined; } | undefined) => SelectionResource`): Required.
- `add` (`(owner: DataIdentity | Iterable<number>, rows?: Iterable<number> | undefined) => SelectionResource`): Required.
- `remove` (`(owner: DataIdentity | Iterable<number>, rows?: Iterable<number> | undefined) => SelectionResource`): Required.
- `toggle` (`(owner: DataIdentity | Iterable<number>, rows?: Iterable<number> | undefined) => SelectionResource`): Required.
- `commitPreview` (`(owner?: DataIdentity | undefined) => SelectionResource`): Required.
- `cancelPreview` (`(owner?: DataIdentity | undefined) => SelectionResource`): Required.
- `clear` (`(owner?: DataIdentity | undefined) => SelectionResource`): Required.

## Usage

Data-owned selection, brush, and hover are available without constructing a separate resource. Explicit resources are useful for additional independent selections. Shared identity, not matching column names, determines which observations correspond.

A selection holds row indices per data owner (a table or an [identity](identity)): `select={focus}` on two marks of one table selects the same rows in both. Rows are indices into the owner's rows as given, whatever order a Sort or a Filter shows them in. The member table above is the JavaScript resource; code that sets rows passes the owner, `focus.replace(owner, [0, 3])`. A data's own resource knows its owner: `dataHandle.getSelection().replace([0, 3])`. When your code must decide which rows are selected (a search box, a rule the expressions cannot write), set them this way: every mark that responds follows on the GPU, without passing new tables.

Plain clicks replace membership; an exact repeat of the owner's selected source-row set clears
it. Shift/Meta/Ctrl clicks toggle membership, and background clicks clear. Aggregate picks
include every contributing row. See the [click drilldown recipe](/HMPlot/recipes.md).

Start with the default: `select=True` (or `hover`, `brush`) on a mark and `respond="selected"`,
or `"@selected"` in an expression or a Filter, use the table's own selection. Make a resource
when several marks or tables share one interaction, or a plot needs a second independent one:
`focus = hm.selection()`, then `select=focus` where rows are picked and `respond=focus`,
`Filter(where=focus)` or an expression where they are read.

## In expressions

A selection is an expression's operand: each row's membership, 1 on its members and 0
elsewhere, the same value `"@selected"` is for a table's own selection. Python combines it with
`&`, `|` and `~`; JavaScript passes it to `where`, `logical_and`, `logical_or` and `logical_not`.

```python
focus = hm.selection()
hm.Points(x="x", y="y", select=focus, opacity=hm.where(focus, 1, 0.15))
hm.Points(x="x", y="y", size=hm.where(focus & (hm.col.value > 10), 9, 4))
with hm.Filter(where=~focus): ...
```

It reads the live phase: a hover or a brush being dragged while one is in progress, else the
committed rows, so marks update as the pointer moves. It is per row, never "is anything
selected": `active` is a status Python reads, not a column (`@any_selected` is the table's own
selection's flag).

## Aggregates

Selecting a row of an aggregate (a Group's, a histogram bin's) selects its contributors, the
original rows in it, through any number of aggregates: a group of groups selects the rows of
every group in it. Reading a selection on an aggregate's row is 1 while any of its contributors
is a member. Filtering before an aggregate (`Filter` then `Group`) leaves out rows; filtering
after it (`Group` then `Filter(where=hm.col.count > 1)`) leaves out groups; either way a
group's membership is that of the rows it holds. A Filter's, Sort's or Calculate's rows are
members as their source rows are. Every way of reading a selection agrees: `respond`,
`Filter(where=focus)`, an Interaction's `"@focus"` and an expression's operand.

## By a column

`hm.selection(by="gene")` selects values, not rows: the rows picked select their values of the
column, and every row with one of those values is a member, in any table that has the column.
Duplicate values are expected: a gene hovered in a table of genes highlights all of its samples
in another table, and hovering a sample highlights its gene and the gene's other samples.

- Values match exactly and by type: the text `"7"` is not the number `7`; datetimes match as
  instants.
- A missing value (None, NaN) matches nothing, and a value a table lacks matches none of its
  rows.
- Every table that writes or reads the selection needs the column, by that name, with its values
  on the host (an error names the column otherwise). Other names for the column and composite
  keys are not supported; give the tables the same column.
- `by` is not a table's `key` (which keeps rows' state through updates) nor `animation_group`.
- Without `by`, a selection matches rows of the table they were picked in (or its
  [identity](identity)) and none of another table's, whatever its columns.

```python
focus = hm.selection(by="gene")
with hm.Row():
    with hm.Plot(data=genes):
        hm.Points(x="length", y="expression", hover=focus, respond=focus)
    with hm.Plot(data=samples):
        hm.Points(x="sample", y="value", size=hm.where(focus, 8, 4), respond=focus)
```

Hover is transient: leaving the point clears it. A click (`select=focus`) commits until the next
click. See the [gene hover recipe](/HMPlot/recipes.md).

## Python members

`hm.selection()` returns a `SelectionResource`, and a table's own are `table.selection`, `table.brush`, `table.hover`, `table.nearby` and `table.nearest` (a node's `selection` and the others reach its data's). Python keeps the state the browser last reported: the properties read it, and `subscribe` follows it. Changing the selection asks a displayed view, so those members are coroutines: they need the selection used in exactly one displayed Scene (a notebook view; else `RuntimeError`, or `hm.SceneError` with code `bridge.missing_view`) and `await`. `data=` names the owner (a `hm.Table` or an identity) when the selection has none of its own or several: an explicit `hm.selection()` always needs it.

| Member | Kind | What it does |
|---|---|---|
| `id` | attribute | The resource's id in the scene. |
| `by` | attribute | The column the selection matches rows by (`hm.selection(by=...)`), or None: the rows themselves. |
| `version` | attribute | Counts the changes Python has received from the browser. |
| `active` | property | Whether any rows are selected, as the browser last reported. |
| `rows` | property | The selected row indices: a tuple for a selection with one owner, else a dict of owner id to tuple. |
| `get_constraints(*, data=None)` | sync | The committed brush constraints: a tuple of dicts, one per brushed column, with its identity, name, type, bounds and categories. |
| `subscribe(callback)` | sync | Call `callback(status)` now and after each change the browser reports; `status` has active, rows and constraints. Returns a function that unsubscribes. |
| `update(rows=(), *, operation='replace', data=None, view=None)` | await | Change the selection in the view: `operation` is replace, add, remove, toggle or clear, and `rows` nonnegative row indices. Returns the view's status: active, count, revision, the owner's rows and constraints. |
| `replace(rows, *, data=None, view=None)` | await | Select exactly `rows`. |
| `add(rows, *, data=None, view=None)` | await | Add `rows` to the selection. |
| `remove(rows, *, data=None, view=None)` | await | Take `rows` out of the selection. |
| `toggle(rows, *, data=None, view=None)` | await | Select the rows of `rows` that are not selected and deselect the others. |
| `clear(*, data=None, view=None)` | await | Select nothing. |
| `clear_columns(*columns, data=None, view=None)` | await | Remove the brush's constraints on `columns`, keeping the others. |

## Related examples

- [Explicit shared selection](/HMPlot/examples/shared-selection.md)
