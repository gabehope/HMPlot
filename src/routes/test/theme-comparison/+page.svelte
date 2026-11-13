<script>
  import { onMount, tick } from "svelte";
  import { Theme, Data, Plot, Points, Line, Area, Heatmap, Text, Legend, InputContext, Playback, Select, Slider, categorical, continuous, themes } from "$lib";
  import { Bar, Histogram, ErrorBars, RuleX, RuleY, BandY, Callout } from "$lib/charts";
  const presets = ["paper", "journal", "presentation", "notebook", "minimal", "ink", "bureau", "observable", "dark"];
  const scenes = ["scatter", "sparse-points", "bubbles", "line-interval-rule", "grouped-bars", "histogram-rule", "dense-dates", "long-legend", "matrix-colorbar", "callouts", "controls"];
  const partials = ["", "marks/points-dense", "marks/points-outlined", "marks/points-open", "marks/points-presentation", "marks/lines-fine", "marks/lines-bold", "marks/intervals-crisp", "marks/bars-muted", "marks/areas-subtle"];
  const palette = ["#416788", "#a65f46", "#61866b"];
  const observations = Array.from({length:36}, (_,i) => ({ x: .5 + i%12, y: 2 + Math.sin(i*1.7) + Math.floor(i/12)*2, group: ["North", "Central", "South"][Math.floor(i/12)], population: [4,16,36][i%3] }));
  const trend = { x:[0,1,2,3,4,5], y:[2,3,4,5,6,7], lo:[1,2,3,4,5,6], hi:[3,4,5,6,7,8],
    category:["North coast","Central district","South valley","North coast","Central district","South valley"], group:["Observed","Observed","Observed","Forecast","Forecast","Forecast"] };
  const dates = Array.from({length:40},(_,i) => ({date:new Date(Date.UTC(2026,0,i+1)), y:3+Math.sin(i/4)}));
  const longRows = observations.map((r,i) => ({...r, group:["Northern coastal research programme", "Central agricultural observation station", "Southern mountain monitoring network"][Math.floor(i/12)]}));
  const matrix = [[1,-.8,.2],[-.8,1,-.4],[.2,-.4,1]];
  const labels = ["Temperature", "Soil moisture", "Plant growth"];
  // This recipe uses an explicit sRGB gray ramp. Compute black/white label contrast from
  // that same ramp, not from a theme-wide text token or a guessed correlation threshold.
  const cellRows = matrix.flatMap((row,y) => row.map((value,x) => {
    const gray = (value+1)/2, linear = gray<=.04045 ? gray/12.92 : ((gray+.055)/1.055)**2.4;
    return {x:labels[x],y:labels[y],value,text:value.toFixed(1),ink:linear>.179?"#000000":"#ffffff"};
  }));
  const ramp = continuous({domain:[-1,1],colormap:{colors:["#000000","#ffffff"],space:"srgb"}});
  const matrixX = categorical({domain:labels}), matrixY = categorical({domain:labels});
  const inks = categorical({domain:["#000000","#ffffff"],range:["#000000","#ffffff"]});
  const sizes = continuous({domain:[4,36],range:[6,24]});
  let viewportWidth = $state(1440);
  let left = $state("paper"), right = $state("presentation"), scene = $state("scatter"), partial = $state("");
  let samePalette = $state(true), explicit = $state(false), plots = $state({}), marks = $state({});
  const names = $derived([left,right]);
  const definition = (name) => ({ extends:[name,...(samePalette ? [{palette,marks:{
    Points:{fill:themes[name].marks.Points.fill==="transparent"?"transparent":null},
    Line:{color:null},Area:{fill:null},ErrorBars:{color:null}
  }}] : []),...(partial?[partial]:[])] });
  async function settle() {
    await tick();
    await Promise.all(Object.values(plots).map(plot=>plot?.whenSettled()));
  }
  onMount(() => {
    window.themeComparison = {
      get plots() { return plots; }, get marks() { return marks; },
      async set(values) {
        if(values.left!==undefined) left=values.left;
        if(values.right!==undefined) right=values.right;
        if(values.scene!==undefined) scene=values.scene;
        if(values.partial!==undefined) partial=values.partial;
        if(values.samePalette!==undefined) samePalette=values.samePalette;
        if(values.explicit!==undefined) explicit=values.explicit;
        await settle();
      },
      async svg(i=0) { await settle(); return (await (await plots[i].exportSVG()).blob.text()); }
    };
    return () => delete window.themeComparison;
  });
</script>

<svelte:window bind:innerWidth={viewportWidth} />
<svelte:head><title>Neutral theme comparison · HMPlot</title></svelte:head>
<main>
  <h1>Neutral theme comparison</h1>
  <p>Both panels use the same data and encodings. The shared palette exposes differences in typography, spacing, guides and marks.</p>
  <div class="choices">
    <label>Left theme <select bind:value={left}>{#each presets as name}<option>{name}</option>{/each}</select></label>
    <label>Right theme <select bind:value={right}>{#each presets as name}<option>{name}</option>{/each}</select></label>
    <label>Chart <select bind:value={scene}>{#each scenes as name}<option>{name}</option>{/each}</select></label>
    <label>Style partial <select bind:value={partial}>{#each partials as name}<option value={name}>{name||"Preset defaults"}</option>{/each}</select></label>
    <label><input type="checkbox" bind:checked={samePalette} /> Shared palette</label>
    <label><input type="checkbox" bind:checked={explicit} /> Explicit point size 12 and red fill</label>
  </div>
  <div class="panels">
    {#each names as name,i}
      <article data-panel={i}>
        <h2>{themes[name].name}</h2>
        <Theme value={definition(name)}>
          <InputContext>
            {#if scene==="controls"}
              <div class="controls">
                <Playback name="year" label="Year" min={2000} max={2026} value={2018} />
                <Select name="station" label="Station" options={["North","Central","South"]} value="North" />
                <Slider name="window" label="Window" min={1} max={12} value={6} />
              </div>
            {/if}
            {#key scene}
            <Plot bind:this={plots[i]} data={scene==="matrix-colorbar"?undefined:["line-interval-rule","grouped-bars","callouts"].includes(scene)?trend:scene==="dense-dates"?dates:scene==="long-legend"?longRows:observations} height={viewportWidth<850?560:430} responsive axes2d autoBounds
              title="Measurements across regions" subtitle="The same observations, differently presented" caption="Source: deterministic comparison data"
              legend={scene==="matrix-colorbar"?false:true}
              x={scene==="matrix-colorbar"?{scale:matrixX,label:"Variable",tickLabelAngle:45,tickCount:3}:scene==="dense-dates"?{label:"Observation date",tickCount:4,format:"%b %d"}:scene==="grouped-bars"?{label:"District",tickLabelAngle:30,grid:"off"}:scene==="histogram-rule"?{label:"Observed value",tickCount:5,grid:"off"}:{label:"Observation",tickCount:5}}
              y={scene==="matrix-colorbar"?{scale:matrixY,label:"Variable"}:scene==="histogram-rule"?{label:"Count",tickCount:4}:{label:"Measurement",tickCount:4}}>
              {#if scene==="line-interval-rule"}
                <BandY y0={3} y1={5} fill="#64748b" opacity={.1} />
                <Area x="x" lower="lo" upper="hi" opacity={.15} />
                <ErrorBars x="x" lower="lo" upper="hi" />
                <Line x="x" y="y" label="Central estimate" />
                <RuleY y={4} color="#64748b" width={1} dash={[5,3]} />
              {:else if scene==="grouped-bars"}
                <Bar x="category" y="y" fill="group" arrange="group" bandFraction={.72} />
              {:else if scene==="histogram-rule"}
                <Histogram x="y" bins={8} />
                <RuleX x={4} color="#64748b" width={1.25} dash={[4,3]} />
              {:else if scene==="dense-dates"}
                <Line x="date" y="y" label="Station readings" />
              {:else if scene==="matrix-colorbar"}
                <Heatmap bind:this={marks[i]} fill={matrix} fillScale={ramp} pixelated />
                <Data value={cellRows}><Text x="x" y="y" text="text" color="ink" colorScale={inks} size={13} /></Data>
                <Theme value={{extends:["legend/compact","legend/inline-bottom"]}}>
                  <Legend for={marks[i]} channel="fill" label="Correlation" position="bottom" />
                </Theme>
              {:else if scene==="callouts"}
                <BandY y0={3} y1={5} fill="#64748b" opacity={.12} />
                <Points bind:this={marks[i]} x="x" y="y" />
                <Callout x={2} y={4} text="A readable note" dx={28} dy={-45} color={name==="dark"?"#f8fafc":"#172033"}
                  box={{fill:name==="dark"?"#1e293b":"#f8fafc",outlineColor:"#64748b",outlineWidth:1,padding:7,radius:5}}
                  leader={{color:"#64748b",width:1}} />
              {:else}
                <Points bind:this={marks[i]} x="x" y="y"
                  fill={explicit?"#c0262e":scene==="sparse-points"?undefined:"group"} size={explicit?12:scene==="bubbles"?"population":undefined}
                  sizeScale={scene==="bubbles"?sizes:undefined} />
              {/if}
            </Plot>
            {/key}
          </InputContext>
        </Theme>
      </article>
    {/each}
  </div>
</main>
<style>
  main { max-width:1440px; margin:24px auto; padding:0 20px; font:15px system-ui,sans-serif; color:#172033; }
  h1 { font-size:26px; } h2 { font-size:16px; font-weight:500; margin:0 0 10px; }
  .choices,.controls { display:flex; flex-wrap:wrap; gap:14px; align-items:center; margin:18px 0; }
  .choices label { display:flex; align-items:center; gap:6px; }
  select { font:inherit; max-width:230px; }
  .panels { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; }
  article { min-width:0; border:1px solid #dfe3e8; border-radius:6px; padding:16px; }
  @media(max-width:850px) { .panels { grid-template-columns:minmax(0,1fr); } main {padding:0 10px;} article{padding:10px;} }
</style>
