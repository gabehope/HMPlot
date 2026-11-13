<script lang="ts">
  import { onMount } from "svelte";
  import {
    Button,
    Checkbox,
    Data,
    Edges,
    Force,
    InputContext,
    Nodes,
    Plot,
    Points,
    Segments,
    Slider,
    input,
    multiply,
    GraphData,
    continuous,
  } from "$lib";
  let { onready } = $props();
  let plot = $state<any>(),
    layout = $state<any>();
  // 36 people in four teams: links mostly within a team. Each team has a column (teamX), each
  // person a size, and three hubs a pull toward a ring (the others' NaN leaves them out).
  const teams = ["North", "East", "South", "West"];
  let seed = 11;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const people = {
    id: [] as number[],
    team: [] as string[],
    teamX: [] as number[],
    size: [] as number[],
    hubPull: [] as number[],
  };
  for (let i = 0; i < 36; i++) {
    const team = i % 4;
    people.id.push(i);
    people.team.push(teams[team]);
    people.teamX.push(team * 120 - 180);
    people.size.push(4 + Math.floor(random() * 8));
    people.hubPull.push(i < 3 ? 0.3 : NaN);
  }
  const edges = { source: [] as number[], target: [] as number[] };
  for (let i = 0; i < 36; i++) {
    edges.source.push(i, i);
    edges.target.push(
      (i + 4) % 36,
      random() < 0.2 ? Math.floor(random() * 36) : (i + 8) % 36,
    );
  }
  $effect(() => {
    if (plot) onready?.(plot);
  });
  onMount(() => {
    if (import.meta.env.DEV)
      (window as any).__transformExample = {
        get plot() {
          return plot;
        },
        get force() {
          return layout;
        },
      };
    return () => {
      delete (window as any).__transformExample;
    };
  });
</script>

<InputContext>
  <div class="controls">
    <Checkbox name="run" label="Run" />
    <Button name="reheat" label="Reheat" />
    <Slider
      name="teamPull"
      min={0}
      max={0.5}
      step={0.01}
      value={0.15}
      label="Team pull"
    />
  </div>
  <Data value={edges}>
    <!-- d3's forces by name: the default centering (x, y) gives way to a pull toward each
         team's column, collision by size, and a ring that only the hubs feel. Team pull sets
         the byTeam force's strength. -->
    <GraphData
      nodes={people}
      {edges}
      nodeKey="id"
      source="source"
      target="target"
      ><Force
        bind:this={layout}
        warmup={60}
        running={input("run")}
        reheat={input("reheat")}
        forces={{
          x: null,
          y: null,
          byTeam: { type: "x", x: "teamX", strength: input("teamPull") },
          level: { type: "y", y: 0, strength: 0.05 },
          spacing: { type: "collide", radius: multiply("size", 1.5) },
          hubs: { type: "radial", radius: 220, strength: "hubPull" },
        }}
      >
        <Plot
          x={{ domain: [-320, 320] }}
          y={{ domain: [-260, 260] }}
          responsive
          bind:this={plot}
          type="2d"
          axes2d={true}
          height={440}
        >
          <Edges
            ><Segments
              start="start"
              end="end"
              color="#8694a0"
              width={1}
            /></Edges
          >
          <Nodes drag
            ><Points
              position="position"
              fill="team"
              size="size"
              sizeScale={continuous({ domain: [0, 12], range: [6, 18] })}
              outlineColor="#30343b"
              outlineWidth={0.45}
            /></Nodes
          >
        </Plot>
      </Force></GraphData
    >
  </Data>
</InputContext>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
</style>
