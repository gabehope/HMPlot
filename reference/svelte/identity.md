# identity

Which rows are the same thing across tables, by key, so selections carry over.

## Example

```svelte
const rows = identity({ keys: ids });
<Points position={positions} identity={rows} select />
```

## Members

- `id` (`string`): Required.
- `length` (`number`): Required.
- `selection` (`SelectionResource`): Required.
- `brush` (`SelectionResource`): Required.
- `hover` (`SelectionResource`): Required.
- `offsets` (`OffsetLayer`): Required.

## Usage

Data and Table normally own identity for you. Explicit identity is useful for raw-array marks. Matching names in separate tables do not imply shared observation identity; use keys when rows reorder.

`identity({ keys })` gives the rows of marks that take raw arrays (`position={...}`) an owner: row i is the observation `keys[i]`, so a selection made on one mark selects the same observations on every mark with that identity, and keyed updates and connections match rows by key. Keys must be unique, present and finite: strings, categories, integers (int64 and uint64 exact) or float32 values. The member table above is the JavaScript object; its `selection`, `brush` and `hover` are [SelectionResources](selection) owned by it.

## Python members

`hm.identity(keys=...)` returns an identity resource with these members, plain attributes fixed when it is made. Its selections' `await` members need a displayed notebook view (see [selection](selection)). Keys that differ only beyond float32 precision are refused, naming the pair; use integer or string keys for large identifiers.

| Member | Kind | What it does |
|---|---|---|
| `id` | attribute | The resource's id in the scene. |
| `keys` | attribute | The keys as the column the browser receives (one-dimensional, typed as `hm.typed_column` types them). |
| `selection` | attribute | The SelectionResource of the rows clicked or set from code. |
| `brush` | attribute | The SelectionResource of the brushed rows. |
| `hover` | attribute | The SelectionResource of the hovered rows. |
| `nearby` | attribute | The SelectionResource of the rows near the pointer. |
| `nearest` | attribute | The SelectionResource of the row a tooltip shows (nearest). |

## Related examples

- [Data selections and brushing](/HMPlot/examples/data-selections.md)
