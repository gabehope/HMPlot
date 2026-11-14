# Pack

A hierarchy drawn as nested circles, each leaf's area set by its value.

## Example

```svelte
<script>
  import { Plot, Pack, Nodes, Points, multiply, GraphData } from "hmplot";
  const data = {
    source: ["root", "root", "a", "a", "a", "b", "b"],
    target: ["a", "b", "a1", "a2", "a3", "b1", "b2"],
  };
</script>

<Plot {data} height={300} aspect="equal">
  <GraphData source="source" target="target"
    ><Pack root="root">
      <Nodes
        ><Points
          position="position"
          size={multiply("r", 2)}
          sizeUnits="data"
          fill="depth"
        /></Nodes
      >
    </Pack></GraphData
  >
</Plot>
```

## Options

- `root` (`string | number | boolean`): The ID of the node whose subtree the layout divides: the hierarchy's root, or any node below it (a drill-down), or an input a Select or a click sets. Nodes outside its subtree stay rows of the nodes table, hidden; depth counts from it (0).
- `levels` (`number`): How many levels below root to show (1: its children only); root itself is then left out, as its area is the whole layout. Default: every level.
- `value` (`column | expression`): Each leaf's nonnegative weight, which sets its circle's area: a nodes-table column or an expression over it. A parent holds the sum of its leaves. Default: `1`.
- `width` (`number`): The width of the area the circles fill. Default: `1` data units.
- `height` (`number`): The height of the area the circles fill. Default: `1` data units.
- `padding` (`number`): The gap between circles. Default: `0` data units.

## Usage

`Pack` uses d3-hierarchy to place one connected, directed hierarchy in nested circles. Supply the edges (and nodes, or let it infer them) and endpoint mapping through GraphData; set `root` on Pack. `value` evaluates on node columns; leaf values determine area and default to 1. `width` and `height` default to 1, and `padding` separates circles.

Inside `<Nodes>`, use `x`, `y`, `position`, and `r` to draw circles: Points with `size={multiply("r", 2)}` and `sizeUnits="data"` in a Plot with `aspect="equal"`, so a data unit is as long on y as on x and each circle stays round and inside its parent (the automatic domain holds every whole circle). `x0`, `x1`, `y0`, and `y1` enclose each circle. `parent`, `depth`, `degree`, and node attributes are also available. `<Edges>` retains source rows and exposes center-to-center `start` and `end`.

`root` may be any node, and `levels` shows that many levels below it, as on [Treemap](treemap): a drill-down. Each node's `total` is its summed value.

## Related examples

- [Circle packing](/HMPlot/examples/packed-hierarchy.md)
