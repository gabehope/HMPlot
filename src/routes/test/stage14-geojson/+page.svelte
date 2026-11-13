<script>
  import { Plot, Frame, Line, GeoJSON, categorical, continuous } from "$lib/index";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "root-limb";
  let lineFill = $state(null);
  let plot = $state(), center = $state(JSON.parse(params.get("center") ?? "[0, 0]")), probe = $state();
  $effect(() => {
    window.stage14GeoJSON = { get plot() { return plot; }, get probe() { return probe; }, scene, lastPick: null,
      setFill(value) { lineFill = value; }, setCenter(value) { center = value; } };
    return () => { delete window.stage14GeoJSON; };
  });
  const polygon = (x0, x1, y0, y1) => ({ type: "Feature", properties: { name: "patch" }, geometry: { type: "Polygon",
    coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } });
  // Longitudes 60..120 straddle the horizon of a globe centered at 0.
  const limb = polygon(60, 120, -20, 20), square = polygon(-30, 30, -20, 20);
  const pick = (event) => window.stage14GeoJSON.lastPick = { featureIndex: event.featureIndex };
</script>

{#if scene === "interaction"}
  <Plot bind:this={plot} data={{ id: ["right", "left"], score: [20, 10] }} width={400} height={400}
    axes2d={false} x={{domain: [-2, 2]}} y={{domain: [-2, 2]}} tooltip={["label", "score"]}>
    <GeoJSON bind:this={probe} hover respond="hovered" selectionOpacity={0.2} outlineWidth={0}
      featureKey="id" dataKey="id" fill="#3478c7" data={{ type: "FeatureCollection", features: [
        { type: "Feature", properties: { id: "left", label: "Left region" }, geometry: { type: "MultiPolygon",
          coordinates: [polygon(-1.5,-0.5,0.2,0.8).geometry.coordinates, polygon(-1.5,-0.5,-0.8,-0.2).geometry.coordinates] } },
        { ...polygon(0.5,1.5,-0.8,0.8), properties: { id: "right", label: "Right region" } }] }} />
  </Plot>
{:else if scene === "root-limb"}
  <!-- A root orthographic globe: the polygon runs behind its horizon. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="orthographic"
    projectionCenter={center} x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <GeoJSON data={limb} fill="#13bd4e" outlineWidth={0} />
    <GeoJSON data={limb} color="#1a5fd0" width={3}  fill={null} />
    <Line position={[[60, 20], [120, 20]]} interpolation="angular" color="#d43735" width={2} />
  </Plot>
{:else if scene === "child"}
  <!-- An orthographic child fitted into a Cartesian root: a visible square and
       a polygon behind its horizon, with Lines along their north edges. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center} radialScale={0}
      x={{ domain: [-180, 180], range: [-0.8, 0.8], visible: false }}
      y={{ domain: [-90, 90], range: [-0.8, 0.8], visible: false }}>
      <GeoJSON bind:this={probe} data={{ type: "FeatureCollection", features: [square, limb] }}
        fill="#13bd4e" outlineWidth={0} onclick={pick} />
      <GeoJSON data={square} color="#1a5fd0" width={3}  fill={null} />
      <Line position={[[60, 20], [120, 20]]} interpolation="angular" color="#d43735" width={2} />
    </Frame>
  </Plot>
{:else if scene === "line-colors" || scene === "line-numbers"}
  <!-- TODO 64: GeoJSON(fill=null) colored by a property, a LineString and a polygon's boundary: by
       category, or by number through the column's extent (TODO 64.9) and a two-color map. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="equirectangular"
    x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <GeoJSON bind:this={probe} width={4} {...(scene === "line-colors"
        ? { color: "kind", colorScale: categorical({ domain: ["road", "river"], range: ["#d43735", "#1a5fd0"] }) }
        : { color: "rank", colormap: { colors: ["#d43735", "#1a5fd0"] } })}
      data={{ type: "FeatureCollection", features: [
        { type: "Feature", properties: { kind: "road", rank: 1 }, geometry: { type: "LineString", coordinates: [[-120, 40], [-20, 40]] } },
        { ...polygon(20, 120, -40, 20), properties: { kind: "river", rank: 2 } }] }} fill={lineFill} />
  </Plot>
{:else if scene === "extrusion"}
  <!-- TODO 73.4: two squares of heights 5 and 10 through a heightScale
       from [0, 10] onto [0, 1], seen from the front: one half as tall as the other. -->
  <Plot bind:this={plot} type="3d-y-up" width={400} height={400} cameraPosition={[0, 0.5, 9]} cameraTarget={[0, 0.5, 0]}
    x={{ domain: [-2, 2], range: [-2, 2], visible: false }} y={{ domain: [-2, 2], range: [-2, 2], visible: false }}
    z={{ domain: [-2, 2], range: [-2, 2], visible: false }}>
    <GeoJSON data={{ type: "FeatureCollection", features: [{ ...polygon(-1.5, -0.5, -0.5, 0.5), properties: { h: 5 } },
        { ...polygon(0.5, 1.5, -0.5, 0.5), properties: { h: 10 } }] }}
      plane="xz" fill="#13bd4e" outlineWidth={0} height="h" heightScale={continuous({ domain: [0, 10], range: [0, 1] })} />
  </Plot>
{:else if scene === "inset-map"}
  <!-- A placed equirectangular inset; the polygon crosses the antimeridian. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Frame coordinates="spherical" projection="equirectangular"
      placement={{ anchor: [0.5, 0.5], size: [100, 100] }}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <GeoJSON data={polygon(150, 210, -20, 20)} fill="#13bd4e" outlineWidth={0} />
    </Frame>
  </Plot>
{/if}
