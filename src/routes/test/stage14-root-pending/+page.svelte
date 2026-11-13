<script>
  import { Plot, Frame, Sort, Points, GeoJSON, DAG, Nodes, Provider, VectorTile, GraphData, Calculate } from "$lib/index";
  let sortedPlot = $state(), sortedFrame = $state();
  let geoPlot = $state(), geoFrame = $state();
  let linePlot = $state(), lineFrame = $state();
  let graphPlot = $state(), graphFrame = $state();
  let dagPlot = $state(), dagFrame = $state();
  let providerPlot = $state(), providerFrame = $state();
  let tilePlot = $state(), tileFrame = $state();
  // A Provider's children mount when its load completes (TODO 20).
  const slowLoad = () => new Promise((resolve) => setTimeout(() => resolve({ x: [2, 8], y: [2, 8] }), 300));
  const graphNodes = { id: ["A", "B"], x: [2, 8], y: [2, 8] };
  const square = { type: "Feature", properties: {}, geometry: { type: "Polygon",
    coordinates: [[[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]]] } };
  $effect(() => {
    window.stage14RootPending = {
      get sortedPlot() { return sortedPlot; }, get sortedFrame() { return sortedFrame; },
      get geoPlot() { return geoPlot; }, get geoFrame() { return geoFrame; },
      get linePlot() { return linePlot; }, get lineFrame() { return lineFrame; },
      get graphPlot() { return graphPlot; }, get graphFrame() { return graphFrame; },
      get dagPlot() { return dagPlot; }, get dagFrame() { return dagFrame; },
      get providerPlot() { return providerPlot; }, get providerFrame() { return providerFrame; },
      get tilePlot() { return tilePlot; }, get tileFrame() { return tileFrame; },
    };
    return () => { delete window.stage14RootPending; };
  });
</script>

<Plot bind:this={sortedPlot} data={{x: [2, 8], y: [2, 8]}}
  width={240} height={180} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
  <Frame bind:this={sortedFrame} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points position={[[4, 4]]} size={6} fill="#26824b" />
  </Frame>
  <Sort by="x"><Points x="x" y="y" size={6} fill="#2468a0" /></Sort>
</Plot>

<Plot bind:this={graphPlot} data={{ source: ["A"], target: ["B"] }}
  width={240} height={180} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
  <Frame bind:this={graphFrame} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points position={[[4, 4]]} size={6} fill="#26824b" />
  </Frame>
  <GraphData nodes={graphNodes} edges={{ source: ["A"], target: ["B"] }} nodeKey="id" source="source" target="target"><Nodes><Calculate columns={{x: "x", y: "y"}}>
    <Nodes><Points position="position" size={6} fill="#2468a0" /></Nodes>
  </Calculate></Nodes></GraphData>
</Plot>

<Plot bind:this={dagPlot} data={{ source: ["A"], target: ["B"] }}
  width={240} height={180} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
  <Frame bind:this={dagFrame} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points position={[[4, 4]]} size={6} fill="#26824b" />
  </Frame>
  <GraphData nodes={graphNodes} edges={{ source: ["A"], target: ["B"] }} nodeKey="id" source="source" target="target"><DAG    >
    <Nodes><Points position="position" size={6} fill="#2468a0" /></Nodes>
  </DAG></GraphData>
</Plot>

<Plot bind:this={geoPlot} width={240} height={180}
  x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
  <Frame bind:this={geoFrame} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points position={[[4, 4]]} size={6} fill="#26824b" />
  </Frame>
  <GeoJSON data={square} fill="#d53e38" />
</Plot>

<Plot bind:this={linePlot} width={240} height={180}
  x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
  <Frame bind:this={lineFrame} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points position={[[4, 4]]} size={6} fill="#26824b" />
  </Frame>
  <GeoJSON data={square} color="#d53e38" width={3}  fill={null} />
</Plot>

<Plot bind:this={providerPlot} width={240} height={180}
  x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
  <Frame bind:this={providerFrame} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points position={[[4, 4]]} size={6} fill="#26824b" />
  </Frame>
  <Provider source={slowLoad}><Points x="x" y="y" size={6} fill="#2468a0" /></Provider>
</Plot>

<!-- A VectorTile's parts mount when its tiles load (TODO 24). -->
<Plot bind:this={tilePlot} width={240} height={180}
  x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
  <Frame bind:this={tileFrame} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points position={[[4, 4]]} size={6} fill="#26824b" />
  </Frame>
  <VectorTile url={"/data/vector-tiles/{z}/{x}/{y}.mvt"} tile={[13, 2411, 3080]} />
</Plot>
