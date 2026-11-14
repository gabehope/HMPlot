const n=`<script>
  import { untrack } from "svelte";
  import { Plot, Theme, Line, Points, themes } from "$lib";

  let { onready = undefined } = $props();
  let plot = $state();
  let selected = $state("minimal");
  const presetNames = [
    "minimal",
    "paper",
    "presentation",
    "colorblind",
    "dark",
    "538",
    "financeTerminal",
    "pastel",
    "graph",
    "sea",
    "sunset",
    "ggplot",
    "seabornDark",
    "notebook",
    "graphingCalculator",
    "observable",
    "wesAnderson",
    "ghibli",
    "yellowGlow",
    "8bit",
    "vaporwave",
    "blueprint",
    "bubblegum",
    "spooky",
    "treasureMap",
    "bureau",
    "journal",
    "bauhaus",
    "risograph",
    "tufte",
  ];
  const observations = Array.from({ length: 36 }, (_, index) => {
    const x = 0.35 + (index % 12) * 0.64;
    const series = Math.floor(index / 12);
    return {
      x,
      y: 0.45 + 0.23 * x + 0.45 * Math.sin(x * 1.35 + series * 0.75) + series * 0.22,
      group: ["North", "Central", "South"][series],
    };
  });
  const trend = Array.from({ length: 81 }, (_, index) => {
    const x = index * 0.1;
    return [x, 0.65 + 0.23 * x + 0.38 * Math.sin(x * 1.35 + 0.7)];
  });

  $effect(() => {
    const current = plot;
    untrack(() => onready?.(current));
  });
<\/script>

<div class="theme-picker" role="group" aria-label="Theme preset">
  {#each presetNames as name}
    <button
      type="button"
      class:active={selected === name}
      aria-pressed={selected === name}
      onclick={() => (selected = name)}
    >
      <span class="preview" aria-hidden="true">
        {#each themes[name].palette.slice(0, 4) as color}
          <span style:background-color={color}></span>
        {/each}
      </span>
      <span>{themes[name].name}</span>
    </button>
  {/each}
</div>

<Theme value={themes[selected]}>
  <Plot
    bind:this={plot}
    data={observations}
    responsive
    height={440}
    axes2d
    legend
    x={{ domain: [0, 8.2], label: "Time" }}
    y={{ domain: [0, 3.5], label: "Value" }}
  >
    <Line position={trend} label="Trend" />
    <Points x="x" y="y" fill="group" label="Observations" />
  </Plot>
</Theme>

<style>
  .theme-picker {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 8px;
    margin: 0 0 14px;
  }
  button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 7px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid #dce2e6;
    border-radius: 8px;
    background: #fff;
    color: #344054;
    font: 12px system-ui, sans-serif;
    text-align: left;
    cursor: pointer;
  }
  button:hover { border-color: #9aaeb8; background: #f7faf9; }
  button.active { border-color: #4d7988; background: #edf5f5; }
  button:focus-visible { outline: 2px solid #417d91; outline-offset: 2px; }
  .preview { display: flex; gap: 4px; width: 100%; }
  .preview span { width: 15px; height: 15px; border-radius: 50%; }
  @media (max-width: 620px) {
    .theme-picker { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
`;export{n as default};
