const e=`<script>
  import { Plot, Points, Text } from "$lib";
  import { onDestroy } from "svelte";

  let { onready = () => {} } = $props();
  const states = [
    [{ id: "A", x: 0.18, y: 0.28 }, { id: "B", x: 0.39, y: 0.65 }, { id: "C", x: 0.65, y: 0.32 }],
    [{ id: "B", x: 0.27, y: 0.55 }, { id: "C", x: 0.58, y: 0.56 }, { id: "D", x: 0.82, y: 0.72 }],
    [{ id: "A", x: 0.24, y: 0.72 }, { id: "C", x: 0.53, y: 0.25 }, { id: "E", x: 0.75, y: 0.48 }],
  ];
  let stage = $state(0), observations = $state(states[0]), plot = $state();
  $effect(() => onready(plot));
  onDestroy(() => onready(undefined));
  function next() {
    stage = (stage + 1) % states.length;
    observations = states[stage].map((row) => ({ ...row }));
  }
<\/script>

<div class="controls">
  <button onclick={next}>Next keyed update</button>
  <span aria-live="polite">State {stage + 1}: {observations.map((row) => row.id).join(", ")}</span>
  <span><code>animation</code> moves retained IDs; <code>enterEffect="fade"</code> and <code>exitEffect="fade"</code> animate opacity.</span>
</div>
<Plot bind:this={plot} data={observations} key="id" responsive height={420} axes2d
  animationDuration={550} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Points x="x" y="y" size={10} fill="#547ba2" outlineColor="#263545"
    outlineWidth={0.4} animation enterEffect="fade" exitEffect="fade" select respond="selected" />
  <Text x="x" y="y" text="id" dy={-20} size={14} color="#40505d"
    animation enterEffect="fade" exitEffect="fade" />
</Plot>

<style>
  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:12px 0; color:#40505d; }
  button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; }
  code { padding:1px 4px; border-radius:4px; background:#eef2f5; color:#31485d; }
</style>
`;export{e as default};
