# Force

A force-directed layout of a graph's nodes and edges, simulated live.

## Example

```svelte
<script>
  import {
    Plot,
    Force,
    Edges,
    Nodes,
    Segments,
    Points,
    GraphData,
  } from "hmplot";
  const data = {
    source: ["A", "A", "B", "C", "D"],
    target: ["B", "C", "C", "D", "E"],
  };
</script>

<Plot {data} height={300}>
  <GraphData source="source" target="target"
    ><Force warmup={300}>
      <Edges><Segments start="start" end="end" /></Edges>
      <Nodes><Points position="position" /></Nodes>
    </Force></GraphData
  >
</Plot>
```

## Options

- `name` (`string`): Names the layout, so a Facet's settings and getTransform(name) reach it in every cell.
- `weight` (`column`): An edge column of nonnegative weights, each multiplying its link's spring strength.
- `dimensions` (`2 | 3`): Lays the graph out in two or three dimensions. Default: `2`.
- `seed` (`number`): Seeds the random starting positions, so the same graph lays out the same way. Default: `42`.
- `repulsion` (`number`): How strongly nodes push one another apart. Default: `30`.
- `linkDistance` (`number`): The length each link's spring pulls toward. Default: `30` data units.
- `springStrength` (`number`): How strongly each link pulls its ends toward linkDistance. Default: `0.1`.
- `centering` (`number`): How strongly each node is pulled toward the origin. Default: `0.01`.
- `velocityDecay` (`number`): The fraction of each node's velocity lost per tick, like friction. Default: `0.4`.
- `alpha` (`number`): The simulation's heat, which scales every force and cools each tick; it starts at 1, so bind it to read it rather than set it. Default: `1`.
- `alphaMin` (`number`): The layout stops once alpha cools below this. Default: `0.001`.
- `alphaDecay` (`number`): The fraction of the way alpha moves toward alphaTarget each tick. Default: 1 - 0.001^(1/300), about 0.0228 (d3's: 300 ticks to cool).
- `alphaTarget` (`number`): The alpha the layout cools toward; above alphaMin it keeps running. Default: `0`.
- `forces` (`object`): Named forces, as d3's (center, manyBody, link, collide, x, y, z, radial). An entry named like a default force updates it, one with a type replaces it, and null removes it. Default: charge, link, and x and y (z in 3D), from the options above.
- `fixed` (`{x, y, z}`): Holds nodes at coordinates from nodes-table columns, expressions or numbers (d3's fx, fy, fz); a non-finite value leaves that node free.
- `initial` (`{x, y, z}`): Starting coordinates from nodes-table columns, expressions or numbers; a non-finite value keeps that node's seeded start.
- `ticks` (`number`): Simulation ticks per drawn step. Default: `1`.
- `warmup` (`number`): Ticks run before the layout is first drawn, so it appears already settled. Default: `0`.
- `running` (`boolean`): Plays (true) or pauses (false) the layout, which otherwise starts paused; a Checkbox's input can drive it.
- `reset` (`number | string`): Each change of its value restarts the layout from its starting positions; a Button's input can drive it.
- `reheat` (`number | string`): Each change of its value reheats the layout (alpha back to 1), so it moves again.
- `step` (`number | string`): Each change of its value pauses the layout and advances it one step.
- `release` (`number | string`): Each change of its value frees every pinned node.

## Usage

Provides Nodes and Edges scopes. Initializes paused. `running` plays and pauses it, and each change of `step`, `reset`, `reheat` or `release` runs that action once, so a [Checkbox](checkbox) and [Buttons](button) can drive it: `running={input("run")}`, `reset={input("reset")}`. The handle's action(id) does the same from code. Defaults include seed 42, link distance 30, repulsion 30, and velocity decay 0.4. Supports 2D/3D and node dragging; topology changes reset the layout.

Requires graph data from GraphData. Outputs are visible to children only. Transforms retain the previous complete result while an update prepares. To let the viewer change a setting, read an input in it: `repulsion={input("repulsion")}` (Python `repulsion=hm.input.repulsion`), where `repulsion` is a [Slider](slider).

## Related examples

- [Force layout · 2D](/HMPlot/examples/transform-force.md)
- [Layered forces](/HMPlot/examples/transform-forces.md)
