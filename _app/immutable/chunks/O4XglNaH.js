const n=`<script>
  import { Plot, Points, Legend, continuous, normalization, ordinal } from "$lib/index";
  let { onready = () => {} } = $props();
  const observations = {
    x: [0, 1, 2, 3, 4, 5],
    y: [2, 4, 3, 5, 4, 6],
    score: [8, 25, 42, 58, 78, 96],
    group: ["Low", "Low", "Middle", "Middle", "High", "High"],
  };
  const comparison = {
    x: [0, 1, 2, 3, 4, 5],
    y: [6, 5, 6, 4, 3, 2],
    score: [20, 35, 40, 60, 74, 82],
  };
  const norm = normalization({ domain: [0, 100] });
  const color = continuous({ normalization: norm, colormap: "Viridis" });
  const size = continuous({ normalization: norm, range: [8, 22] });
  const ordered = ordinal({ domain: ["Low", "Middle", "High"], colormap: "Viridis" });
  let first = $state(), mapped = $state(), categories = $state();
  $effect(() => { if (first) onready(first); });
  $effect(() => {
    if (!import.meta.env.DEV || !first) return;
    window.__scaleExample = first;
    return () => { delete window.__scaleExample; };
  });
<\/script>

<div class="scale-examples">
  <section>
    <h3>One source, two encodings</h3>
    <p>Color and size use one normalization. The same score keeps the same meaning in either channel.</p>
    <Plot bind:this={first} data={observations} responsive height={310} axes2d
      x={{ domain: [-0.3, 5.3] }} y={{ domain: [1, 7] }}>
      <Points bind:this={mapped} x="x" y="y" fill="score" size="score"
        fillScale={color} sizeScale={size} outlineColor="#263545" outlineWidth={0.25} />
      <Legend for={mapped} channel="fill" label="Score" position="right" />
    </Plot>
  </section>
  <section>
    <h3>Separate data scope</h3>
    <p>This table also has a “score” column. Its automatic scale remains independent.</p>
    <Plot data={comparison} responsive height={310} axes2d
      x={{ domain: [-0.3, 5.3] }} y={{ domain: [1, 7] }}>
      <Points x="x" y="y" fill="score" size={6}
        outlineColor="#263545" outlineWidth={0.25} />
    </Plot>
  </section>
  <section>
    <h3>Ordered categories</h3>
    <p>An ordinal colormap samples colors in the supplied category order.</p>
    <Plot data={observations} responsive height={270} axes2d
      x={{ domain: [-0.3, 5.3] }} y={{ domain: [1, 7] }}>
      <Points bind:this={categories} x="x" y="y" fill="group"
        fillScale={ordered} size={7.5} outlineColor="#263545" outlineWidth={0.3} />
      <Legend for={categories} channel="fill" label="Band" position="right" />
    </Plot>
  </section>
</div>

<style>
  .scale-examples { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: 20px; }
  section { min-width: 0; }
  h3 { margin: 0 0 6px; font-size: 1.05rem; }
  p { margin: 0 0 12px; color: #627080; line-height: 1.45; }
</style>
`;export{n as default};
