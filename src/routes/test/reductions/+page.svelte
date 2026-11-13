<script>
  // Stage 12 fixtures: reductions inside expressions, expression-valued transform
  // parameters, and named bin rules.
  import { onMount } from "svelte";
  import { Plot, Calculate, Density, Rect, Line, Data, Facet, Filter, Points, col, subtract, divide, multiply, mean, std, count, power, logical_and, greater, add, sin, InputContext, Slider, input, cumsum, lag, window as rolling, sum, categorical } from "$lib/index";
import { Bin } from "$lib/stats/index.js";
import { Histogram } from "$lib/charts/index.js";
  let zPlot = $state(), zBin = $state(), rulePlot = $state(), ruleBin = $state(),
    sizedPlot = $state(), sizedBin = $state(), densityPlot = $state(), density = $state(),
    ruleRect = $state(), sizedRect = $state();
  // Irwin-Hall: symmetric, bounded, and the same every run.
  let seed = 12345;
  const uniform = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const values = Array.from({ length: 400 }, () =>
    (uniform() + uniform() + uniform() - 1.5) * 4);
  const wide = values.map((v) => v * 4);
  let observations = $state({ x: values });
  // Two facet cells of very different sizes (16 and 100 rows), so a count resolved per cell
  // would differ between them and from the count over both (116 rows).
  const cells = {
    x: [...values.slice(0, 16), ...values.slice(100, 200)],
    g: [...Array(16).fill("small"), ...Array(100).fill("large")],
  };
  let ruleFacet = $state(), sizedFacet = $state();
  // 40 rows on a 40 x 40 square: a Filter keeps the brushed rows right of the mean x (19.5),
  // and a Calculate reads a reduction but no interaction column.
  const brushRows = {
    x: Array.from({ length: 40 }, (_, i) => i),
    y: Array.from({ length: 40 }, (_, i) => (i * 17) % 40),
  };
  let brushPlot = $state(), aboveBrushed = $state(), centred = $state();
  let histogramPlot = $state(), histogram = $state();
  let clockPlot = $state(), clockPoints = $state();
  let clockRows = $state({ i: [0, 1, 2, 3], r: [1, 2, 3, 4] });
  let operationsPlot = $state(), operationsPoints = $state();
  const operationsRows = { x: [0, 1, 2, 3, 4], v: [1, 2, NaN, 4, 5], g: ["a", "b", "a", "b", "a"] };
  onMount(() => {
    window.reductionFixture = {
      get zPlot() { return zPlot; }, get zBin() { return zBin; },
      get rulePlot() { return rulePlot; }, get ruleBin() { return ruleBin; },
      get sizedPlot() { return sizedPlot; }, get sizedBin() { return sizedBin; },
      get ruleRect() { return ruleRect; }, get sizedRect() { return sizedRect; },
      get densityPlot() { return densityPlot; }, get density() { return density; },
      get ruleFacet() { return ruleFacet; }, get sizedFacet() { return sizedFacet; },
      get brushPlot() { return brushPlot; }, get aboveBrushed() { return aboveBrushed; },
      get centred() { return centred; }, brushRows,
      get histogramPlot() { return histogramPlot; }, get histogram() { return histogram; },
      get clockPlot() { return clockPlot; }, get clockPoints() { return clockPoints; },
      get operationsPlot() { return operationsPlot; }, get operationsPoints() { return operationsPoints; },
      doubleClock: () => { clockRows = { i: [0, 1, 2, 3], r: [2, 4, 6, 8] }; },
      widen: () => { observations = { x: wide }; },
      narrow: () => { observations = { x: values }; },
    };
    return () => { delete window.reductionFixture; };
  });
</script>

<h3>Standard scores from a reduction</h3>
<div data-fixture="z">
  <Plot bind:this={zPlot} data={{ x: values }} width={420} height={240} axes2d>
    <Calculate columns={{ z: divide(subtract(col("x"), mean("x")), std("x")) }}>
      <Bin bind:this={zBin} x="z" bins={10}>
        <Rect x0="x0" x1="x1" y0={0} y1="count" fill="#547ba2" />
      </Bin>
    </Calculate>
  </Plot>
</div>

<h3>Ordered expressions and selected-row totals</h3>
<div data-fixture="operations">
  <InputContext>
    <Slider name="operationWidth" label="Rolling width" min={1} max={4} step={1} value={2} />
    <Plot bind:this={operationsPlot} data={operationsRows} width={420} height={280}
      x={{ domain: [-0.5, 4.5] }} y={{ domain: [-1, 12] }}>
      <Calculate columns={{ running: cumsum("v", {by: "g", orderBy: "x"}),
        difference: subtract("v", lag("v", {by: "g", orderBy: "x", fill: 0})),
        recent: rolling(greater("v", 3), {by: "g", orderBy: "x", size: input("operationWidth"), reduce: "any"}),
        selectedTotal: sum("v", {where: "@selected"}) }}>
        <Points bind:this={operationsPoints} x="x" y="running" size={7} select respond={false}
          fill="recent" fillScale={categorical({ domain: [false, true], range: ["#2058df", "#e83c32"] })} />
        <Line x="x" y="selectedTotal" color="#238d45" width={2} label="Selected total" />
      </Calculate>
    </Plot>
  </InputContext>
</div>

<h3>A bin count from a rule</h3>
<div data-fixture="rule">
  <Plot bind:this={rulePlot} data={{ x: values }} width={420} height={240} axes2d>
    <Bin bind:this={ruleBin} x="x" bins="sturges">
      <Rect bind:this={ruleRect} x0="x0" x1="x1" y0={0} y1="count" fill="#7b9865" />
    </Bin>
  </Plot>
</div>

<h3>A bin count from the data</h3>
<div data-fixture="sized">
  <Plot bind:this={sizedPlot} data={{ x: values }} width={420} height={240} axes2d>
    <Bin bind:this={sizedBin} x="x" bins={power(count("x"), 0.5)}>
      <Rect bind:this={sizedRect} x0="x0" x1="x1" y0={0} y1="count" fill="#cf8955" />
    </Bin>
  </Plot>
</div>

<h3>A Histogram whose bin count is an expression</h3>
<div data-fixture="histogram">
  <Plot bind:this={histogramPlot} data={{ x: values }} width={420} height={240} axes2d>
    <Histogram bind:this={histogram} x="x" bins={power(count("x"), 0.5)} />
  </Plot>
</div>

<h3>A bandwidth from the data</h3>
<div data-fixture="bandwidth">
  <Plot bind:this={densityPlot} data={observations} width={420} height={240} axes2d>
    <Density bind:this={density} x="x" bandwidth={multiply(std("x"), 0.3)} resolution={64}>
      <Line x="x" y="density" width={2} />
    </Density>
  </Plot>
</div>

<h3>Faceted histograms with a rule and with an expression</h3>
<div data-fixture="facet-bins">
  <Data value={cells}>
    <Facet bind:this={ruleFacet} column="g">
      <Plot width={260} height={180} axes2d><Histogram x="x" bins="sturges" /></Plot>
    </Facet>
    <Facet bind:this={sizedFacet} column="g">
      <Plot width={260} height={180} axes2d><Histogram x="x" bins={power(count("x"), 0.5)} /></Plot>
    </Facet>
  </Data>
</div>

<h3>A brushed Filter with a reduction, and a Calculate the brush does not touch</h3>
<div data-fixture="brush">
  <Plot bind:this={brushPlot} data={brushRows} width={420} height={320} axes2d
    x={{ domain: [0, 40] }} y={{ domain: [0, 40] }}>
    <Points x="x" y="y" size={3} fill="#547ba2" brush />
    <Filter where={logical_and("@brushed", greater("x", mean("x")))}>
      <Points bind:this={aboveBrushed} x="x" y="y" size={5.5} fill="#cf8955" />
    </Filter>
    <Calculate bind:this={centred} columns={{ offset: subtract("x", mean("x")) }}>
      <Points x="x" y="offset" size={1.5} fill="#7b9865" />
    </Calculate>
  </Plot>
</div>

<h3>An @time channel around reductions</h3>
<div data-fixture="clock">
  <!-- y = mean(r) + std(r) sin(t / 1 s): every row moves together about the mean. -->
  <Plot bind:this={clockPlot} data={clockRows} width={360} height={220} axes2d
    x={{ domain: [-1, 4] }} y={{ domain: [0, 5] }}>
    <Points bind:this={clockPoints} x="i"
      y={add(mean("r"), multiply(std("r"), sin(divide("@time", 1000))))} size={4} />
  </Plot>
</div>
