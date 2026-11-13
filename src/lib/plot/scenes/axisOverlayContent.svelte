<script>
  import Axes3DOverlay from "./Axes3DOverlay.svelte";
  import { resolveAxisStyle, tickOffsets, arrowPath, axisStrokePath } from "../utils/axisStyle.js";
  import {polarDomain, jointProjectionOf} from "../utils/coordinates.js";
  import { onViewContext } from "../utils/viewContext.js";
  import { onDestroy } from "svelte";
  import { readable } from "svelte/store";
  import { OFFSET_RISE, polarAxisLayout, polarBands } from "../utils/axes.js";
  import { MAX_SHARE, plotGutters } from "../utils/plotLayout.js";
  import { framePoint } from "../utils/framePlacement.js";
  import { orthographicGuides } from "../utils/orthographicGuides.js";
  import { mapGuides } from "../utils/mapGuides.js";
  import { warpedGuides } from "../utils/warpedGuides.js";
  import { drawnStrips } from "../utils/brushStrips.js";
  import { gridColors, haloColor } from "../utils/axisColors.js";
  import { withGenericFamily } from "../utils/defaultFont.js";
  // `titles`: the frame's axis titles (TODO 21; "" draws no title element).
  let { options, frame, mode, width, height, show2d, show3d, layout, frameBox = null, placement = null, onstrips = undefined, titles = {} } =
    $props();
  const revision = readable(0, (set) => {
    let version = 0;
    const stops = [
      "projection","projectionCenter","_projectionCenterLongitude","_projectionCenterLatitude","angleUnit","anglePeriod","baseRadius","radialScale","zbounds","zrange","zTransform",
      "xTransform",
      "xbounds",
      "xrange",
      "yTransform",
      "ybounds",
      "yrange",
      "_frameXRange", "_frameYRange", "_frameTopology", "_warpedGuides", "coordinates",
    ].map((key) => options.on(() => set(++version), key));
    stops.push(onViewContext(options, () => set(++version)));
    return () => stops.forEach((stop) => stop());
  });
  const styles = $derived(options.child("plot"));
  const styleRevision = readable(0, (set) => {
    let version = 0;
    return styles.on(() => set(++version));
  });
  const style = $derived.by(() => {
    $styleRevision;
    const values = Object.fromEntries(
      [
        "axisFontSize",
        "annotationFontSize",
        "axisFontFamily",
        "axisTextColor",
        "axisLineColor",
        "background",
        "axisLineWidth",
        "axisTickSize",
        "axisFrame",
        "axisTickLabels",
        "axisTitles",
      ].map((key) => [key, styles.get(key)]),
    );
    // A stack without a generic family falls back to sans-serif, on screen and in exports.
    values.axisFontFamily = withGenericFamily(values.axisFontFamily);
    return values;
  });
  // Colors follow the plot, not the page or the OS: text in axisTextColor, lines and ticks in
  // axisLineColor, and text drawn over a halo of the plot's own background, so labels over marks
  // stay legible without a light halo smearing light text on a dark theme.
  const halo = $derived(haloColor(style.background) ?? "none");
  const colors = $derived(`--axis-line:${style.axisLineColor ?? "currentColor"};--axis-halo:${halo}`);
  // Rule and band labels are annotations, in the text's size (Text's and Callout's, TODO 134.29),
  // clear of their line: NOTE px beside it, and a horizontal rule's below its descenders.
  const note = $derived(Number(style.annotationFontSize) || style.axisFontSize);
  const NOTE = 5, above = $derived(NOTE + Math.round(0.25 * note));
  // Reference rules without a color of their own: the grid's color.
  const grid = $derived(gridColors(style.background, style.axisTextColor));
  // Margins crop the overlay, never remap data coordinates. Bound oversized
  // margins so a small embedded plot cannot produce inverted axis lines.
  // A root-side frame draws at the plot's area (the layout solver's, TODO 136.10); without a
  // layout yet, at the margins every reader falls back to (plotGutters).
  const gutters = $derived.by(() => {
    $styleRevision;
    return plotGutters(styles);
  });
  const rootSide = (side, fallback) => Number.isFinite(layout?.[side]) ? layout[side] : fallback;
  const left = $derived(placement?.spatial ? layout?.left ?? 0 : rootSide("left", Math.min(gutters.left, width * MAX_SHARE)));
  const right = $derived(
    placement?.spatial ? layout?.right ?? width : rootSide("right", width - Math.min(gutters.right, width * MAX_SHARE)),
  );
  const top = $derived(placement?.spatial ? layout?.top ?? 0 : rootSide("top", Math.min(gutters.top, height * MAX_SHARE)));
  const bottom = $derived(
    placement?.spatial ? layout?.bottom ?? height : rootSide("bottom", height - Math.min(gutters.bottom, height * MAX_SHARE)),
  );
  const xs=$derived(placement?.x?.side??"bottom"), ys=$derived(placement?.y?.side??"left");
  const xb=$derived(xs==="top"?top-(placement?.x?.offset??0):bottom+(placement?.x?.offset??0));
  const yb=$derived(ys==="right"?right+(placement?.y?.offset??0):left-(placement?.y?.offset??0));
  const showX=$derived(placement?.x?.show!==false),showY=$derived(placement?.y?.show!==false);
  // A Facet cell's inner axis (its outer axes are another cell's): ticks, no labels.
  const labelX=$derived(placement?.x?.labels!==false),labelY=$derived(placement?.y?.labels!==false);
  const visual = (axis) => {
    const config = layout?.[axis]?.config ?? {};
    return {
      ...resolveAxisStyle(config, style),
      tickWidth: config.tickWidth ?? 1,
      arrow: config.arrow ?? "none",
      arrowSize: config.arrowSize ?? 7,
      tickLabelAngle: config.tickLabelAngle ?? 0,
      tickLabelAlign: config.tickLabelAlign ?? "auto",
      tickLabelPlacement: config.tickLabelPlacement ?? "outside",
      tickLabelOffset: config.tickLabelOffset ?? 3,
      titlePosition: config.titlePosition ?? "end",
      titleAngle: config.titleAngle === "auto"
        ? (axis === "y" && config.titlePlacement === "outside" ? -90 : 0)
        : Number(config.titleAngle ?? 0),
      titlePlacement: config.titlePlacement ?? "inside",
      titleOffset: config.titleOffset ?? 7,
    };
  };
  const xv=$derived(visual("x")),yv=$derived(visual("y")),zv=$derived(visual("z"));
  const anchor = (value, fallback) => value === "auto" ? fallback : value;
  // Tick direction is independent of tick-label placement.
  const labelTickSize = (v) => v.ticks && (v.tickDirection === "both" || v.tickDirection === v.tickLabelPlacement) ? v.tickSize : 0;
  const xTick = $derived(tickOffsets(xv));
  const yTick = $derived(tickOffsets(yv));
  const frameEdges = $derived.by(() => {
    if (!style.axisFrame || polar || centeredOrthographic || jointMap) return [];
    const edges = [];
    if (!(showX && xv.line && xs === "top")) edges.push(`M${left} ${top} H${right}`);
    if (!(showX && xv.line && xs === "bottom")) edges.push(`M${left} ${bottom} H${right}`);
    if (!(showY && yv.line && ys === "left")) edges.push(`M${left} ${top} V${bottom}`);
    if (!(showY && yv.line && ys === "right")) edges.push(`M${right} ${top} V${bottom}`);
    return edges;
  });
  const xTicks = $derived.by(() => {
    $revision;
    return frame
      ? (layout?.x.major ?? [])
          .filter((t) => layout.x.config.major)
          .map((t) => ({ ...t, p: t.fraction * width }))
          // A tick on the corner too: a bar's 0 baseline is the axis's end (TODO 134.27), as is
          // a rounded end (TODO 136.17).
          .filter((t) => t.p >= left - 0.5 && t.p <= right + 0.5)
      : [];
  });
  // The second row of datetime labels, from its tick to the next change (TODO 53.4).
  const xContext = $derived.by(() => {
    $revision;
    if (!frame || !layout?.x.config.major) return [];
    const entries = (layout?.x.context ?? []).map((t) => ({ ...t, p: t.fraction * width }));
    // The first period's label starts at the first tick drawn when its own tick is in the margin.
    if (entries.length && entries[0].p < left && xTicks.length && (entries.length < 2 || xTicks[0].p < entries[1].p))
      entries[0] = { ...entries[0], p: xTicks[0].p };
    return entries.filter((t) => t.p >= left && t.p + measureLabel(t.label) <= width);
  });
  const yTicks = $derived.by(() => {
    $revision;
    return frame
      ? (layout?.y.major ?? [])
          .filter((t) => layout.y.config.major)
          .map((t) => ({ ...t, p: (1 - t.fraction) * height }))
          .filter((t) => t.p >= top - 0.5 && t.p <= bottom + 0.5)
      : [];
  });
  const polarSource=$derived.by(()=>{$revision;return options.get('coordinates')==='polar';});
  const polar=$derived(polarSource);
  const centeredOrthographic=$derived.by(()=>{$revision;return options.get('coordinates')==='spherical'&&options.get('projection')==='orthographic';});
  // A joint projection's map (equal-earth, albers, ...): a graticule and outline, no edge axes.
  const jointMap=$derived.by(()=>{$revision;return !!jointProjectionOf(options);});
  const radialVisual=$derived(yv);
  const radialShown=$derived(placement?.y?.show!==false);
  // Where the 2D branch below draws each axis's ticks and labels, published for strip brushing so
  // strips exist only where something is drawn (label placement, offsets, hidden labels, size).
  let labelContext;
  const measureLabel = (text) => {
    labelContext ??= typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (!labelContext) return 0.6 * style.axisFontSize * String(text).length;
    labelContext.font = `${style.axisFontSize}px ${style.axisFontFamily}`;
    return labelContext.measureText(String(text)).width;
  };
  // Outside titles sit beyond the tick text, including rotated labels and datetime context.
  const titleReach = (axis, visual, ticks) => {
    if (visual.titlePlacement !== "outside") return visual.titleOffset;
    let depth = visual.ticks && visual.tickDirection !== "inside" ? visual.tickSize : 0;
    if (style.axisTickLabels && visual.tickLabelPlacement === "outside") {
      const angle = visual.tickLabelAngle * Math.PI / 180;
      const widths = ticks.filter(t => t.showLabel).map(t => measureLabel(t.label));
      // A y axis's compact labels' offset sits above it, aligned as a label.
      if (axis === "y" && layout?.y.offset) widths.push(measureLabel(layout.y.offset));
      const w = Math.max(0, ...widths), h = style.axisFontSize;
      depth += visual.tickLabelOffset + (axis === "x"
        ? Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h
        : Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h);
      if (axis === "x" && (xContext.length || layout?.x.offset)) depth += h + 2;
    }
    return depth + visual.titleOffset;
  };
  const xTitleReach = $derived(titleReach("x", xv, xTicks));
  const yTitleReach = $derived(titleReach("y", yv, yTicks));
  const strips = $derived.by(() => {
    if (!onstrips || frameBox || mode !== "2d" || !show2d || !frame || polar || centeredOrthographic || jointMap || width < 120 || height < 80) return null;
    const labels = (ticks) => style.axisTickLabels ? ticks.filter((tick) => tick.showLabel).map((tick) => tick.label) : [];
    const xsign = (xs === "top" ? -1 : 1) * (xv.tickLabelPlacement === "outside" ? 1 : -1);
    const ysign = (ys === "right" ? 1 : -1) * (yv.tickLabelPlacement === "outside" ? 1 : -1);
    return drawnStrips({
      x: showX && xTicks.length ? { line: xb, from: left, to: right, sign: xsign, tickSize: labelTickSize(xv),
        labelOffset: xv.tickLabelOffset, labels: labels(xTicks), angle: xv.tickLabelAngle } : null,
      y: showY && yTicks.length ? { line: yb, from: top, to: bottom, sign: ysign, tickSize: labelTickSize(yv),
        labelOffset: yv.tickLabelOffset, labels: labels(yTicks), angle: yv.tickLabelAngle } : null,
    }, { fontSize: style.axisFontSize, measure: measureLabel });
  });
  $effect(() => { onstrips?.(strips); });
  onDestroy(() => onstrips?.(null));
  const polarGuides=$derived.by(()=>{
    $revision;if(!polar||!frame)return null;
    const r=Math.max(...polarDomain(options).x),sx=width/(frame.x[1]-frame.x[0]),sy=height/(frame.y[1]-frame.y[0]);
    const ticks=layout?.polar?{angular:layout.x,radial:layout.y}:polarAxisLayout(options,Math.min(width,height));
    const cx=-frame.x[0]*sx,cy=height+frame.y[0]*sy;
    return {r,sx,sy,cx,cy,point:(angle,radius)=>
      [cx+radius*Math.cos(angle)*sx,cy-radius*Math.sin(angle)*sy],...ticks};
  });
  // A polar frame's band labels (TODO 46): at the middle of an angular band's outer arc, at the
  // start of a radial band's.
  const polarBandLabels=$derived.by(()=>{
    $revision;$styleRevision;
    if(!polarGuides)return [];
    return polarBands(options).filter((band)=>band.label).map((band)=>{
      const world=framePoint(options,[...(band.axis==="x"?band.outer[Math.floor(band.outer.length/2)]:band.outer[0]),0]);
      return {text:band.label,x:polarGuides.cx+world[0]*polarGuides.sx+NOTE,y:polarGuides.cy-world[1]*polarGuides.sy-NOTE};
    }).filter((label)=>Number.isFinite(label.x)&&Number.isFinite(label.y));
  });
  const globeGuides=$derived.by(()=>{
    $revision;$styleRevision;
    return centeredOrthographic && frame && width >= 120 && height >= 80
      ? orthographicGuides(options, frame, width, height, { shown: { x: showX, y: showY },
          fontSize: style.axisFontSize, measure: measureLabel }) : null;
  });
  const graticule=$derived.by(()=>{
    $revision;$styleRevision;
    return jointMap && frame && width >= 120 && height >= 80 ? mapGuides(options, frame, width, height) : null;
  });
  // A bent chart or fitted curved child: its guides follow the chain.
  const bentGuides = $derived.by(() => {
    $revision;$styleRevision;
    const show = options.get("_warpedGuides");
    const text = { size: style.axisFontSize, titles: { x: titles?.x ?? "", y: titles?.y ?? "" },
      offset: { x: style.axisTickSize + xv.tickLabelOffset, y: style.axisTickSize + yv.tickLabelOffset } };
    return show && mode === "2d" && frame ? warpedGuides(options, frame, width, height, show, 0.5, text) : null;
  });
</script>

{#if frameBox}
  <Axes3DOverlay {frameBox} {width} {height} {style}/>
{/if}
{#if mode === "3d" && show3d && frame}
  <svg
    class="gizmo"
    style={colors}
    viewBox="0 0 96 96"
    role="img"
    aria-label="3D orientation axes"
  >
    <circle cx="48" cy="48" r="44" class="surface" />
    {#each frame.axes as axis (axis.label)}
      <line
        x1={48 - axis.x * 28}
        y1={48 - axis.y * 28}
        x2="48"
        y2="48"
        stroke={axis.color}
        opacity=".35"
        stroke-dasharray="2 3"
      />
      <line
        x1="48"
        y1="48"
        x2={48 + axis.x * 28}
        y2={48 + axis.y * 28}
        stroke={axis.color}
        stroke-width="2"
      />
      <circle
        cx={48 + axis.x * 28}
        cy={48 + axis.y * 28}
        r="9"
        fill={axis.color}
      />
      <text
        x={48 + axis.x * 28}
        y={48 + axis.y * 28 + 3.5}
        text-anchor="middle"
        fill="white">{axis.label}</text
      >
    {/each}
  </svg>
{:else if mode === '2d' && show2d && polarGuides}
  <svg data-export-axes class="axes" {width} {height} aria-label="Polar coordinate axes" style={colors} style:font-size={`${style.axisFontSize}px`} style:font-family={style.axisFontFamily} style:color={style.axisTextColor}>
    {#if radialShown}
      {#each polarGuides.radial.reference as rule (rule.value)}
        {#if rule.width !== 0}
          <ellipse class="polar-reference" data-axis="y" data-value={rule.value}
            cx={polarGuides.cx} cy={polarGuides.cy} rx={rule.radius*polarGuides.sx} ry={rule.radius*polarGuides.sy}
            fill="none" stroke={rule.color ?? grid.major} stroke-width={rule.width ?? 1}
            stroke-dasharray={rule.dash?.join(" ") ?? undefined}/>
        {/if}
        {#if rule.label}<text class="rule-label" font-size={note} x={polarGuides.cx+rule.radius*polarGuides.sx+NOTE} y={polarGuides.cy-above}>{rule.label}</text>{/if}
      {/each}
      {#each polarGuides.radial.config.minor ? polarGuides.radial.minor : [] as tick (tick.value)}
        <ellipse class="guide" cx={polarGuides.cx} cy={polarGuides.cy} rx={tick.radius*polarGuides.sx} ry={tick.radius*polarGuides.sy} fill="none" stroke-opacity=".12" stroke-width={Math.max(.5,radialVisual.lineWidth*.7)}/>
      {/each}
      {#each polarGuides.radial.config.major ? polarGuides.radial.major : [] as tick (tick.value)}
        <ellipse class="guide" cx={polarGuides.cx} cy={polarGuides.cy} rx={tick.radius*polarGuides.sx} ry={tick.radius*polarGuides.sy} fill="none" stroke-opacity=".25" stroke-width={radialVisual.lineWidth}/>
        {#if style.axisTickLabels && tick.showLabel}<text x={polarGuides.cx+tick.radius*polarGuides.sx+radialVisual.tickLabelOffset} y={polarGuides.cy-4} text-anchor={anchor(radialVisual.tickLabelAlign,"start")} transform={`rotate(${radialVisual.tickLabelAngle} ${polarGuides.cx+tick.radius*polarGuides.sx+radialVisual.tickLabelOffset} ${polarGuides.cy-4})`}>{tick.label}</text>{/if}
      {/each}
    {/if}
    {#each polarBandLabels as label}<text class="band-label" font-size={note} x={label.x} y={label.y}>{label.text}</text>{/each}
    {#if placement?.x?.show!==false}
      {#each polarGuides.angular.reference as rule (rule.value)}
        {@const [x,y]=polarGuides.point(rule.angle,polarGuides.r)}
        {#if rule.width !== 0}
          <line class="polar-reference" data-axis="x" data-value={rule.value}
            x1={polarGuides.cx} y1={polarGuides.cy} x2={x} y2={y}
            stroke={rule.color ?? grid.major} stroke-width={rule.width ?? 1}
            stroke-dasharray={rule.dash?.join(" ") ?? undefined}/>
        {/if}
        {#if rule.label}<text class="rule-label" font-size={note} x={x+NOTE} y={y-NOTE}>{rule.label}</text>{/if}
      {/each}
      {#each polarGuides.angular.config.minor ? polarGuides.angular.minor : [] as tick (tick.value)}
        {@const [x,y]=polarGuides.point(tick.angle,polarGuides.r)}
        <line class="guide" x1={polarGuides.cx} y1={polarGuides.cy} x2={x} y2={y} stroke-opacity=".1" stroke-width={Math.max(.5,xv.lineWidth*.7)}/>
      {/each}
      {#each polarGuides.angular.config.major ? polarGuides.angular.major : [] as tick (tick.value)}
        {@const [x,y]=polarGuides.point(tick.angle,polarGuides.r)}
        <line class="guide" x1={polarGuides.cx} y1={polarGuides.cy} x2={x} y2={y} stroke-opacity=".2" stroke-width={xv.lineWidth}/>
        {#if style.axisTickLabels && tick.showLabel}<text x={x} y={y-xv.tickLabelOffset-2} text-anchor={anchor(xv.tickLabelAlign,"middle")} transform={`rotate(${xv.tickLabelAngle} ${x} ${y-xv.tickLabelOffset-2})`}>{tick.label}</text>{/if}
      {/each}
    {/if}
    {#if radialShown && radialVisual.arrow !== "none"}
      {@const rr=polarGuides.r*polarGuides.sx}
      <line class="axis-line" x1={polarGuides.cx} y1={polarGuides.cy} x2={polarGuides.cx+rr} y2={polarGuides.cy} stroke-width={radialVisual.lineWidth}/>
      {#if radialVisual.arrow==='start'||radialVisual.arrow==='both'}<path class="arrowhead" d={arrowPath(polarGuides.cx,polarGuides.cy,-1,0,radialVisual.arrowSize)}/>{/if}
      {#if radialVisual.arrow==='end'||radialVisual.arrow==='both'}<path class="arrowhead" d={arrowPath(polarGuides.cx+rr,polarGuides.cy,1,0,radialVisual.arrowSize)}/>{/if}
    {/if}
  </svg>
{:else if mode === "2d" && show2d && globeGuides}
  <svg data-export-axes class="axes" {width} {height} role="img" aria-label="Orthographic geographic guides"
    style={colors} style:font-size={`${style.axisFontSize}px`} style:font-family={style.axisFontFamily} style:color={style.axisTextColor}>
    {#if showX || showY}
      <ellipse class="guide globe-outline" cx={globeGuides.outline.cx} cy={globeGuides.outline.cy}
        rx={globeGuides.outline.rx} ry={globeGuides.outline.ry} fill="none" stroke-opacity=".6"
        stroke-width={(showX ? xv : yv).lineWidth}/>
    {/if}
    {#each [{axis:"x",show:showX,visual:xv},{axis:"y",show:showY,visual:yv}] as item (item.axis)}
      {#if item.show}
        <!-- The lines are on the GPU (globeGuides.svelte, TODO 141): their labels only. -->
        {#each globeGuides[item.axis].reference as rule (rule.value)}
          {#if rule.label && rule.anchor}
            <text class="geographic-reference-label" x={rule.anchor.x+4} y={rule.anchor.y-4}>{rule.label}</text>
          {/if}
        {/each}
        {#each globeGuides[item.axis].major as guide (guide.value)}
          {#if style.axisTickLabels && guide.showLabel && guide.anchor}
            <text class="geographic-label" data-axis={item.axis} data-value={guide.value}
              x={guide.anchor.x+(item.axis==="y"?-5:0)} y={guide.anchor.y+(item.axis==="x"?-4:0)}
              text-anchor={item.axis==="y"?"end":"middle"}>{guide.label}</text>
          {/if}
        {/each}
      {/if}
    {/each}
  </svg>
{:else if mode === "2d" && show2d && jointMap}
  {#if graticule}
    <svg data-export-axes class="axes" {width} {height} role="img" aria-label="Map graticule"
      style={colors} style:color={style.axisTextColor}>
      {#if showY}
        {#each graticule.parallels as line (line.value)}
          <path class="map-graticule" data-axis="y" data-value={line.value} d={line.d} fill="none"
            stroke-opacity=".22" style:stroke-width={Math.max(.5, yv.lineWidth * .8)}/>
        {/each}
      {/if}
      {#if showX}
        {#each graticule.meridians as line (line.value)}
          <path class="map-graticule" data-axis="x" data-value={line.value} d={line.d} fill="none"
            stroke-opacity=".22" style:stroke-width={Math.max(.5, xv.lineWidth * .8)}/>
        {/each}
      {/if}
      {#if graticule.outline}
        <path class="map-outline" d={graticule.outline} fill="none" stroke-opacity=".6" style:stroke-width={xv.lineWidth}/>
      {/if}
    </svg>
  {/if}
{:else if mode === "2d" && show2d && frame && !centeredOrthographic && width >= 120 && height >= 80}
  <svg
    data-export-axes
    class="axes"
    {width}
    {height}
    role="img"
    aria-label="2D coordinate axes"
    style={colors}
    style:font-size={`${style.axisFontSize}px`}
    style:font-family={style.axisFontFamily}
    style:color={style.axisTextColor}
  >
    {#if showX && axisStrokePath(left,xb,right,xb,xv)}<path class="axis-lines" d={axisStrokePath(left,xb,right,xb,xv)} style:stroke-width={xv.lineWidth}/>{/if}
    {#each frameEdges as d}{#if style.axisLineWidth > 0}<path class="frame-edge" {d} style:stroke-width={style.axisLineWidth}/>{/if}{/each}
    {#if showY && axisStrokePath(yb,bottom,yb,top,yv)}<path class="axis-lines" d={axisStrokePath(yb,bottom,yb,top,yv)} style:stroke-width={yv.lineWidth}/>{/if}
    {#if showX && (xv.arrow==='start'||xv.arrow==='both')}<path class="arrowhead" d={arrowPath(left,xb,-1,0,xv.arrowSize)}/>{/if}
    {#if showX && (xv.arrow==='end'||xv.arrow==='both')}<path class="arrowhead" d={arrowPath(right,xb,1,0,xv.arrowSize)}/>{/if}
    {#if showY && (yv.arrow==='start'||yv.arrow==='both')}<path class="arrowhead" d={arrowPath(yb,bottom,0,1,yv.arrowSize)}/>{/if}
    {#if showY && (yv.arrow==='end'||yv.arrow==='both')}<path class="arrowhead" d={arrowPath(yb,top,0,-1,yv.arrowSize)}/>{/if}
    {#each showX?xTicks:[] as tick (tick.value)}
      {@const xsign=(xs==="top"?-1:1)*(xv.tickLabelPlacement==="outside"?1:-1)}
      <g
        class="x-tick"
        data-value={tick.value}
        transform={`translate(${tick.p},${xb})`}
      >
        {#if xv.ticks && xv.tickWidth > 0}<path d={`M0 ${(xs==="top"?-1:1)*xTick[0]} V${(xs==="top"?-1:1)*xTick[1]}`} style:stroke-width={xv.tickWidth}/>{/if}
        {#if style.axisTickLabels && labelX && tick.showLabel}
          <text
            y={xsign*(labelTickSize(xv)+xv.tickLabelOffset)+(xsign>0?style.axisFontSize:0)}
            text-anchor={anchor(xv.tickLabelAlign,"middle")}
            transform={`rotate(${xv.tickLabelAngle} 0 ${xsign*(labelTickSize(xv)+xv.tickLabelOffset)+(xsign>0?style.axisFontSize:0)})`}>{tick.label}</text
          >
        {/if}
      </g>
    {/each}
    {#each showX && labelX && style.axisTickLabels ? xContext : [] as entry (entry.value)}
      {@const xsign=(xs==="top"?-1:1)*(xv.tickLabelPlacement==="outside"?1:-1)}
      <text class="x-context" x={entry.p} y={xb+xsign*(labelTickSize(xv)+xv.tickLabelOffset+style.axisFontSize+2)+(xsign>0?style.axisFontSize:0)}
        text-anchor="start">{entry.label}</text>
    {/each}
    <!-- Compact labels' offset (TODO 136.10): x's ends its second row at the right end, y's
         sits above its top (below its bottom under a top x axis), aligned as its labels, and
         inside the canvas under a pinned margin too small for it. -->
    {#if showX && labelX && style.axisTickLabels && layout?.x.offset && layout.x.config.major}
      {@const xsign=(xs==="top"?-1:1)*(xv.tickLabelPlacement==="outside"?1:-1)}
      <text class="x-offset" x={right} y={xb+xsign*(labelTickSize(xv)+xv.tickLabelOffset+style.axisFontSize+2)+(xsign>0?style.axisFontSize:0)}
        text-anchor="end">{layout.x.offset}</text>
    {/if}
    {#if showY && labelY && style.axisTickLabels && layout?.y.offset && layout.y.config.major}
      {@const ysign=(ys==="right"?1:-1)*(yv.tickLabelPlacement==="outside"?1:-1)}
      <text class="y-offset" x={yb+ysign*(labelTickSize(yv)+yv.tickLabelOffset)} y={xs==="top"?Math.min(height-.7*style.axisFontSize,bottom+OFFSET_RISE*style.axisFontSize):Math.max(.7*style.axisFontSize,top-OFFSET_RISE*style.axisFontSize)} dy=".32em"
        text-anchor={anchor(yv.tickLabelAlign,ysign>0?"start":"end")}>{layout.y.offset}</text>
    {/if}
    {#each showY?yTicks:[] as tick (tick.value)}
      {@const ysign=(ys==="right"?1:-1)*(yv.tickLabelPlacement==="outside"?1:-1)}
      <g
        class="y-tick"
        data-value={tick.value}
        transform={`translate(${yb},${tick.p})`}
      >
        {#if yv.ticks && yv.tickWidth > 0}<path d={`M${(ys==="right"?1:-1)*yTick[0]} 0 H${(ys==="right"?1:-1)*yTick[1]}`} style:stroke-width={yv.tickWidth}/>{/if}
        {#if style.axisTickLabels && labelY && tick.showLabel}
          <text x={ysign*(labelTickSize(yv)+yv.tickLabelOffset)} dy=".32em" text-anchor={anchor(yv.tickLabelAlign,ysign>0?"start":"end")} transform={`rotate(${yv.tickLabelAngle} ${ysign*(labelTickSize(yv)+yv.tickLabelOffset)} 0)`}
            >{tick.label}</text
          >
        {/if}
      </g>
    {/each}
    {#each ["x", "y"].filter(a=>a==='x'?showX:showY) as axis}
      {#each layout?.[axis].config.minor ? layout[axis].minor : [] as tick}
        {@const p =
          (axis === "x" ? tick.fraction : 1 - tick.fraction) *
          (axis === "x" ? width : height)}
        {#if (axis === "x" ? xv.ticks : yv.ticks) && p >= (axis === "x" ? left : top) && p <= (axis === "x" ? right : bottom)}
          <path
            d={axis === "x"
              ? `M${p} ${xb+(xs==='top'?-1:1)*xTick[0]/2} V${xb+(xs==='top'?-1:1)*xTick[1]/2}`
              : `M${yb+(ys==='right'?1:-1)*yTick[0]/2} ${p} H${yb+(ys==='right'?1:-1)*yTick[1]/2}`}
            style:stroke-width={axis==='x'?xv.tickWidth:yv.tickWidth}
          />
        {/if}
      {/each}
      {#each layout?.[axis].bands ?? [] as band}
        {@const p = axis === "x" ? Math.max(left, band.fractions[0] * width) : Math.max(top, (1 - band.fractions[1]) * height)}
        {#if band.label}
          <text class="band-label" font-size={note} x={axis === "x" ? p + NOTE : left + NOTE} y={axis === "x" ? top + note + 2 : p + note + 2}
            text-anchor="start">{band.label}</text>
        {/if}
      {/each}
      {#each layout?.[axis].reference ?? [] as rule}
        {@const p =
          (axis === "x" ? rule.fraction : 1 - rule.fraction) *
          (axis === "x" ? width : height)}
        {#if rule.label && p >= (axis === "x" ? left : top) && p <= (axis === "x" ? right : bottom)}
          <text class="rule-label" font-size={note}
            x={axis === "x" ? p + NOTE : right - NOTE}
            y={axis === "x" ? top + note + 2 : p - above}
            text-anchor={axis === "x" ? "start" : "end"}>{rule.label}</text
          >
        {/if}
      {/each}
    {/each}
    {#if style.axisTitles}
      {@const xt=xv.titlePosition==='start'?left:xv.titlePosition==='middle'?(left+right)/2:right}
      {@const xa=xv.titlePosition==='start'?'start':xv.titlePosition==='middle'?'middle':'end'}
      {@const xtsign=(xs==='top'?-1:1)*(xv.titlePlacement==='outside'?1:-1)}
      {#if showX && titles?.x}<text class="x-title" font-weight={xv.titleFontWeight} x={xt} y={xb+xtsign*xTitleReach} dominant-baseline={xtsign>0?'hanging':'auto'} text-anchor={xa} transform={`rotate(${xv.titleAngle} ${xt} ${xb+xtsign*xTitleReach})`}>{titles.x}</text>{/if}
      {@const yt=yv.titlePosition==='start'?bottom:yv.titlePosition==='middle'?(top+bottom)/2:top}
      {@const ya=yv.titlePosition==='middle'?'middle':yv.titlePosition==='start'?'end':'start'}
      {@const ytsign=(ys==='right'?1:-1)*(yv.titlePlacement==='outside'?1:-1)}
      {#if showY && titles?.y}<text class="y-title" font-weight={yv.titleFontWeight} x={yb+ytsign*yTitleReach} text-anchor={yv.titleAngle !== 0 ? ya : ytsign>0?'start':'end'} dominant-baseline={yv.titleAngle !== 0 ? (ytsign<0?'auto':'hanging') : ya} y={yt} transform={`rotate(${yv.titleAngle} ${yb+ytsign*yTitleReach} ${yt})`}>{titles.y}</text>{/if}
    {/if}
  </svg>
{/if}
{#if bentGuides}
  <svg data-export-axes class="axes" {width} {height} role="img" aria-label="Warped frame guides"
    style={colors} style:font-size={`${style.axisFontSize}px`} style:font-family={style.axisFontFamily} style:color={style.axisTextColor}>
    {#each ["x", "y"] as axis (axis)}
      {#if bentGuides[axis]}
        {@const visual = axis === "x" ? xv : yv}
        {#each bentGuides[axis].minor as tick (tick.value)}
          <path class="warped-grid" data-axis={axis} data-minor="true" data-value={tick.value} d={tick.d}
            fill="none" stroke-opacity=".12" stroke-width={Math.max(.5, visual.lineWidth * .7)}/>
        {/each}
        {#each bentGuides[axis].major as tick (tick.value)}
          <path class="warped-grid" data-axis={axis} data-value={tick.value} d={tick.d}
            fill="none" stroke-opacity=".25" stroke-width={visual.lineWidth}/>
        {/each}
        {#if bentGuides[axis].edge && visual.line}
          <path class="warped-edge" data-axis={axis} d={bentGuides[axis].edge} fill="none"
            stroke-width={visual.lineWidth}/>
        {/if}
        {#if style.axisTickLabels}
          {#each bentGuides[axis].labels as tick (tick.value)}
            <text class="warped-label" data-axis={axis} data-value={tick.value} x={tick.x} y={tick.y}
              text-anchor="middle" dominant-baseline="central">{tick.label}</text>
          {/each}
        {/if}
        {#if bentGuides[axis].title}
          <text class="warped-title" font-weight={visual.titleFontWeight} data-axis={axis} x={bentGuides[axis].title.x} y={bentGuides[axis].title.y}
            text-anchor="middle" dominant-baseline="central">{bentGuides[axis].title.label}</text>
        {/if}
      {/if}
    {/each}
  </svg>
{/if}

<style>
  svg {
    position: absolute;
    pointer-events: none;
    z-index: 1;
    overflow: hidden;
    font: 11px "Source Sans 3", system-ui, sans-serif;
  }
  /* Bottom left: the plot's settings and export buttons have the bottom right (TODO 60). */
  .gizmo {
    left: 10px;
    bottom: 10px;
    width: 96px;
    height: 96px;
  }
  .surface {
    fill: var(--axis-halo, #fffffff0);
    fill-opacity: 0.94;
    stroke: var(--axis-line, #d9deea);
    stroke-opacity: 0.35;
  }
  .axes {
    inset: 0;
    color: #394458;
  }
  /* Lines and ticks in the line color; a path with a stroke of its own (a colored reference
     rule) keeps it. Guides and grids are the line color at their own opacity and width. */
  .axes path:not([stroke]):not(.arrowhead) {
    stroke: var(--axis-line, currentColor);
    fill: none;
    stroke-width: var(--axis-line-width, 1);
  }
  .axes .axis-line, .axes .guide { stroke: var(--axis-line, currentColor); }
  .axes .arrowhead { fill: var(--axis-line, currentColor); stroke: none; }
  .axes text {
    fill: currentColor;
    stroke: var(--axis-halo, #ffffff);
    stroke-width: 3px;
    stroke-linejoin: round;
    paint-order: stroke;
  }
</style>
