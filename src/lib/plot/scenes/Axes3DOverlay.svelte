<script>
  import { resolveAxisStyle, tickOffsets, arrowPath, axisStrokePath } from '../utils/axisStyle.js';
  import { gridColors } from '../utils/axisColors.js';
  import { withGenericFamily } from '../utils/defaultFont.js';
  let { frameBox, width, height, style } = $props();
  const visuals = $derived(Object.fromEntries(['x', 'y', 'z'].map(axis =>
    [axis, resolveAxisStyle(frameBox.config?.[axis] ?? {}, style)])));
  const grids = $derived(gridColors(style.background, style.axisTextColor));
  const halo = $derived(style.background && style.background !== 'transparent' ? style.background : 'none');
  const textPosition = (tick, visual) => {
    const title = tick.title, outside = (title ? visual.titlePlacement : visual.tickLabelPlacement) !== 'inside';
    const offset = title ? visual.titleOffset + (outside ? visual.tickSize + style.axisFontSize + visual.tickLabelOffset : 0)
      : visual.tickLabelOffset + (outside ? visual.tickSize : 0);
    const sign = outside ? 1 : -1, normal = tick.normal ?? { x: 0, y: 1 };
    const x = tick.x + sign * normal.x * offset, y = tick.y + sign * normal.y * offset;
    const configured = title ? visual.titleAlign : visual.tickLabelAlign;
    const anchor = configured && configured !== 'auto' ? configured :
      Math.abs(normal.x) < .2 ? 'middle' : sign * normal.x < 0 ? 'end' : 'start';
    return { x, y, anchor, angle: title ? visual.titleAngle === 'auto' ? 0 : visual.titleAngle : visual.tickLabelAngle };
  };
</script>

<svg data-export-axes class="axes3d-overlay" {width} {height} aria-label="3D coordinate axes"
  style:font-size={`${style.axisFontSize}px`} style:font-family={withGenericFamily(style.axisFontFamily)}
  fill={style.axisTextColor} stroke={style.axisLineColor}>
  {#each frameBox.grids ?? [] as grid}
    {@const visual = visuals[grid.axis]}
    {#if grid.points.every(point => point.visible) && visual.gridWidth > 0}
      <line class="box-grid" data-plane={grid.plane} x1={grid.points[0].x} y1={grid.points[0].y}
        x2={grid.points[1].x} y2={grid.points[1].y} stroke={visual.gridColor ?? grids[grid.minor ? 'minor' : 'major']}
        stroke-width={visual.gridWidth} stroke-dasharray={visual.gridDash?.join(' ') ?? undefined}/>
    {/if}
  {/each}
  {#each frameBox.edges as edge}
    {@const visual = visuals[edge.axis]}
    {@const border = frameBox.frame && (!edge.primary || visual.line === false)
      ? { ...visual, line: true, lineWidth: style.axisLineWidth } : visual}
    {#if edge.points.every(point => point.visible)}
      {@const stroke = axisStrokePath(edge.points[0].x, edge.points[0].y, edge.points[1].x, edge.points[1].y,
        edge.primary ? border : { ...border, arrow: 'none' })}
      {#if stroke}
        <path class="box-edge" d={stroke} fill="none" stroke-opacity={frameBox.frame || edge.primary ? 1 : .55} stroke-width={border.lineWidth}/>
      {/if}
      {#if edge.primary}
        {#each [0, 1] as end}
          {#if visual.arrow === 'both' || visual.arrow === (end ? 'end' : 'start')}
            {@const point = edge.points[end]}
            {@const other = edge.points[1 - end]}
            <path class="arrowhead" d={arrowPath(point.x, point.y, point.x - other.x, point.y - other.y, visual.arrowSize)} fill={style.axisLineColor} stroke="none"/>
          {/if}
        {/each}
      {/if}
    {/if}
  {/each}
  {#each frameBox.ticks as tick}
    {@const visual = visuals[tick.axis]}
    {#if tick.visible}
      {#if !tick.title && tick.showTick && visual.ticks && visual.tickWidth > 0}
        {@const offsets = tickOffsets(visual, tick.minor)}
        <line class="box-tick" x1={tick.x + tick.normal.x * offsets[0]} y1={tick.y + tick.normal.y * offsets[0]}
          x2={tick.x + tick.normal.x * offsets[1]} y2={tick.y + tick.normal.y * offsets[1]} stroke-width={visual.tickWidth}/>
      {/if}
      {#if tick.showLabel}
        {@const at = textPosition(tick, visual)}
        <text class:box-title={tick.title} data-axis={tick.axis} x={at.x} y={at.y} text-anchor={at.anchor} dominant-baseline="central"
          transform={`rotate(${at.angle ?? 0} ${at.x} ${at.y})`} font-weight={tick.title ? visual.titleFontWeight : 400}
          stroke={halo} stroke-width="3" stroke-linejoin="round" paint-order="stroke">{tick.label}</text>
      {/if}
    {/if}
  {/each}
</svg>

<style>
  .axes3d-overlay { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
</style>
