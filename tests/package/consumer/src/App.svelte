<script lang="ts">
  import { Html } from "hmplot";
  import { inspect } from "hmplot/check";
  let checked = $state(false);
  import { Data, Plot, Frame, GeoJSON, categorical, literal, Points, Text3D, Line, Legend, Area, Facet, Rect, Prism, Interpolate, Slice, Force, Nodes, Edges, Segments, Heatmap, InputContext, Slider, Button, input, GraphData } from "hmplot";
import { Bin, Hexbin } from "hmplot/stats";
import { Histogram, ErrorBars } from "hmplot/charts";
  // The compound subpath: the same components, plus the experimental authoring surface.
  import {
    Histogram as CompoundHistogram,
    Lollipop,
    composition,
  } from "hmplot/compound";
  import JaxInputs from "./JaxInputs.svelte";
  if (typeof composition.Transform !== "function")
    throw Error("hmplot/compound composition surface is missing.");
  let plot = $state<ReturnType<typeof Plot>>();
  let mode = $state<"2d" | "3d">("2d");
  const categoryColors = categorical({
    domain: ["A", "B"],
    range: ["#547ba2", "#cf8955"],
  });
  const table = { x: [-0.5, 0.5], y: [0.7, 0.7], group: ["A", "B"] };
  let categoryPoints = $state<ReturnType<typeof Points>>();
  let frames = $state(false);
  let mounted = $state(true);
  let extra = $state(false),
    transforms = $state(false),
    force = $state<ReturnType<typeof Force>>(),
    iteration = $state(0),
    jaxInputs = $state(false);
  // Force's iteration count stays on its status for code that reads it.
  $effect(() =>
    force?.subscribe((status) => (iteration = status.iteration ?? 0)),
  );
</script>

<h1>Installed package</h1>
<button onclick={() => (mounted = !mounted)}>Toggle plot</button>
<button onclick={(event) => plot?.openSettings(event.currentTarget)}
  >External settings</button
>
<p>Mode: {mode}</p>
{#if mounted}
  <Plot
    bind:this={plot}
    bind:type={mode}
    width={480}
    height={320}
    name="Packaged plot"
    axes2d
    legend
  >
    <Html x={0} y={0} dx={10} dy={10}>
      <button onclick={async () => checked = (await inspect()).ready}>Inspect packaged plots</button>
      <output>{checked ? "Inspection ready" : "Not inspected"}</output>
    </Html>
    <GeoJSON
      name="Packaged geography"
      data={{
        type: "Polygon",
        coordinates: [
          [
            [-0.9, -0.8],
            [-0.7, -0.8],
            [-0.7, -0.6],
            [-0.9, -0.6],
            [-0.9, -0.8],
          ],
        ],
      }}
      fill="#718b9b"
    />
    <Data value={table}
      ><Points
        bind:this={categoryPoints}
        x="x"
        y="y"
        fill="group"
        fillScale={categoryColors}
        outlineColor={literal("white")}
      /></Data
    >
    <Legend for={categoryPoints} channel="fill" label="Category" />
    <Area
      x={[-0.8, 0, 0.8]}
      lower={[-0.5, -0.1, 0.1]}
      upper={[-0.1, 0.3, 0.5]}
      label="Interval"
    />
    <Area x={[-0.8, 0, 0.8]} upper={[-0.2, 0.1, 0.3]} label="Area" />
    <ErrorBars
      position={[[0, 0.1]]}
      lower={[-0.2]}
      upper={[0.4]}
      label="Uncertainty"
    />
    <Points
      name="Samples"
      position={[
        [-0.5, -0.3],
        [0.2, 0.4],
        [0.6, 0.1],
      ]}
    />
    <Line
      position={[
        [-0.5, -0.3],
        [0.2, 0.4],
        [0.6, 0.1],
      ]}
    />
    <Text3D
      name="Title"
      text="Installed text"
      position={[0, 0.55]}
      size={5}
      font="optimer"
    />
    <Text3D tex text={"x^2 + y^2"} position={[0, -0.45]} size={5} />
  </Plot>
{/if}

<Legend for={plot} />

<button onclick={() => (extra = !extra)}>Facet examples</button>
{#if extra}
  <Data value={table}>
    <Facet column="group"
      ><Plot height={200} axes2d
        ><Bin x="x" bins={3}><Rect x0="x0" x1="x1" y0={0} y1="count" /></Bin
        ></Plot
      ></Facet
    >
    <Plot width={360} height={240}
      ><Hexbin x="x" y="y" bins={3}
        ><Prism
          x="x"
          y="y"
          width="width"
          depth="depth"
          rotation="rotation"
          z0={0}
          z1="count"
          shape="hexagon"
        /></Hexbin
      ></Plot
    >
  </Data>
{/if}

<button onclick={() => (transforms = !transforms)}>Transform examples</button>
{#if transforms}
  <InputContext>
    <Slider
      name="resolution"
      min={2}
      max={16}
      step={1}
      value={8}
      label="Resolution"
    />
    <Data value={{ x: [0, 1, 0, 1], y: [0, 0, 1, 1], value: [0, 1, 2, 3] }}
      ><Interpolate
        x="x"
        y="y"
        values={["value"]}
        resolution={input("resolution")}
        ><Plot
          x={{ domain: [0, 1] }}
          y={{ domain: [0, 1] }}
          width={300}
          height={200}><Heatmap fill="value" /></Plot
        ></Interpolate
      ></Data
    >
    <Data value={{ time: [0, 1], x: [0, 1], y: [1, 0] }}
      ><Slice field="time" at={0.5}
        ><Plot width={300} height={200}><Points x="x" y="y" /></Plot></Slice
      ></Data
    >
    <!-- Each press changes step=, which advances the layout one step. -->
    <Button name="step" label="Step" /><output>Step {iteration}</output>
    <Data value={{ source: ["A", "B"], target: ["B", "C"] }}
      ><GraphData source="source" target="target"
        ><Force bind:this={force} step={input("step")}
          ><Plot width={300} height={200}
            ><Edges><Segments start="start" end="end" /></Edges><Nodes drag
              ><Points position="position" /></Nodes
            ></Plot
          ></Force
        ></GraphData
      ></Data
    >
  </InputContext>
{/if}

<button onclick={() => (frames = !frames)}>Coordinate frames</button>
{#if frames}
  <section aria-label="Packaged frames">
    <Plot
      data={{ x: [0, 1, 2], a: [0, 1, 2], b: [0, 10, 20] }}
      width={400}
      height={240}
    >
      <Frame
        x={{ domain: [0, 2] }}
        y={{ domain: "auto", label: "Packaged left" }}
        ><Line x="x" y="a" /></Frame
      >
      <Frame
        x={{ domain: [0, 2], visible: false }}
        y={{ domain: "auto", label: "Packaged right", side: "right" }}
        ><Line x="x" y="b" /></Frame
      >
    </Plot>
    <Plot data={{ x: [0, 1, 2] }} width={400} height={220} axes2d
      ><Histogram x="x" bins={3} /></Plot
    >
  </section>
  <section aria-label="Compound subpath">
    <Plot data={{ x: [0, 1, 2], y: [2, 1, 3] }} width={400} height={220} axes2d
      ><CompoundHistogram x="x" bins={3} /><Lollipop x="x" y="y" /></Plot
    >
  </section>
{/if}

<button onclick={() => (jaxInputs = !jaxInputs)}>JAX inputs</button>
{#if jaxInputs}
  <JaxInputs />
{/if}
