# Sample

Keeps a random subset of the rows, a number or a fraction of them, in their original order or shuffled.

## Example

```svelte
<script>
  import { Plot, Sample, Points } from "hmplot";
  const data = {
    x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    y: [4, 7, 2, 9, 5, 3, 8, 6, 1, 10],
  };
</script>

<Plot {data} height={300} axes2d>
  <Sample size={5}>
    <Points x="x" y="y" />
  </Sample>
</Plot>
```

## Options

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `size` (`number | expression`): How many rows to keep. Default: every row, up to 1000 (every row with order "random").
- `proportion` (`number | expression`): The fraction of the rows to keep, 0 to 1, instead of size.
- `seed` (`number`): The random seed: the same seed picks the same rows in the same order. Default: `42`.
- `order` (`"data" | "random"`): "data" keeps the sampled rows in their original order; "random" puts them in the seed's random order, so order="random" without a size shuffles every row. Default: `"data"`.

## Usage

Retains selected rows in original order and preserves source identities. Specify size or proportion. Default seed is 42. With `order="random"` the kept rows come in the seed's random order instead, and without a size or proportion every row is kept: `<Sample order="random">` (Python `hm.Sample(order="random")`) shuffles the table, as the removed Shuffle did. This changes the data scope; mark-level rendering sampling is a separate performance setting.

To let the viewer change a setting, read an input in it: `size={input("size")}` (Python `size=hm.input.size`), where `size` is a [Slider](slider).

## Related examples

- [Named data & categories](/HMPlot/examples/categories.md)
