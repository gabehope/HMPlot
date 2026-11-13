<script>
  import { minimapSource } from "./utils/minimapSource.js";
  import { pngScale } from "./utils/documentExport.js";
  import {
    viewportRectangles,
    overviewPoint,
    clampOverviewCenter,
  } from "./utils/minimapMath.js";
  import { blobDataURL } from "./utils/exportDocument.js";
  import { embedDefaultFont } from "./utils/defaultFont.js";
  import { composedDocument } from "./utils/sceneDocumentExport.js";
  let {
    for: plot = undefined,
    axis = undefined,
    width = 180,
    height = 120,
    displayScale = 0.35,
    maxInstances = 1000,
    axes = /** @type {boolean | {x?: boolean, y?: boolean}} */ (false),
  } = $props();
  let host = $state(),
    canvas = $state(),
    frame = $state.raw(null),
    connection = $state.raw();
  $effect(() => connection?.configure(displayScale, maxInstances, axes, axis));
  let drag;
  const rects = $derived(
    frame?.mode === "2d"
      ? viewportRectangles(frame.view, frame.fit, frame.fit.periodic)
      : [],
  );
  $effect(() => {
    const source = minimapSource(plot?.getMinimapSource?.());
    if (!source || !canvas || !host) return;
    const c = source.connect(canvas, (value) => (frame = value));
    connection = c;
    const observer = new ResizeObserver(([entry]) =>
      c.resize(entry.contentRect.width, entry.contentRect.height),
    );
    observer.observe(host);
    return () => {
      observer.disconnect();
      c.dispose();
      connection = undefined;
      frame = null;
      clearDrag();
    };
  });
  export function exportable() { return frame?.mode === '2d'; }
  /** Why a Scene's export leaves this minimap out, for its report (TODO 67.6), or null. */
  export function exportOmission() { return frame?.mode && frame.mode !== '2d' ? 'A Minimap of a 3D plot was left out of the export: only a 2D plot\'s minimap exports (as an image).' : null; }
  export async function exportPNG(options={}) {
    const scale=pngScale(options);
    if(!connection || frame?.mode!=='2d')throw Error('Only a mounted 2D minimap can be exported.');
    const blob=await connection.exportPNG(scale),bitmap=await createImageBitmap(blob);
    const output=document.createElement('canvas');output.width=bitmap.width;output.height=bitmap.height;
    const context=output.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
    for(const svg of host.querySelectorAll('svg')){
      const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
      clone.setAttribute('width',String(frame.fit.width));clone.setAttribute('height',String(frame.fit.height));
      const original=[svg,...svg.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
      for(let i=0;i<copies.length;i++){const style=getComputedStyle(original[i]);for(const key of ['font','fill','fill-opacity','stroke','stroke-opacity','stroke-width','opacity'])copies[i].style.setProperty(key,style.getPropertyValue(key));}
      await embedDefaultFont(clone);
      const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
      try{const image=new Image();image.src=url;await image.decode();context.drawImage(image,0,0,output.width,output.height);}finally{URL.revokeObjectURL(url);}
    }
    return new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed.'))));
  }
  async function exportDocument(format, options={}) {
    if (!exportable()) throw Error('Only a mounted 2D minimap can be exported.');
    if (options.mode === 'vector') throw Error('Strict vector export cannot represent minimap GPU content. Use mode="auto".');
    const dpi=Number(options.rasterDpi??300),blob=await exportPNG({scale:Math.max(.1,dpi/96)}),href=await blobDataURL(blob),
      report={mode:options.mode??'auto',vectorPrimitives:0,rasterLayers:[{kind:'minimap',dpi,marks:['Minimap']}],markOutcomes:[{mark:'Minimap',kind:'minimap',rendering:'raster'}],warnings:[]},
      svg=`<image x="0" y="0" width="${width}" height="${height}" href="${href}"/>`;
    return composedDocument([{svg,report}],width,height,format,options);
  }
  export const exportSVG=(options={})=>exportDocument('svg',options);
  export const exportPDF=(options={})=>exportDocument('pdf',options);
  function clearDrag() {
    const id = drag?.id;
    drag = undefined;
    if (id !== undefined && host?.hasPointerCapture(id))
      host.releasePointerCapture(id);
  }
  $effect(() => {
    if (drag && (!frame || frame.mode !== drag.mode)) clearDrag();
  });
  function point(event) {
    const r = host.getBoundingClientRect();
    return {
      x: event.clientX - r.left - host.clientLeft,
      y: event.clientY - r.top - host.clientTop,
    };
  }
  function down(event) {
    if (event.button !== 0 || !frame || !connection) return;
    event.preventDefault();
    event.stopPropagation();
    host.focus({ preventScroll: true });
    const p = point(event);
    if (frame.mode === "2d" && frame.fit.rect && (p.x < frame.fit.rect.left || p.x > frame.fit.rect.right || p.y < frame.fit.rect.top || p.y > frame.fit.rect.bottom)) return;
    const
      start = connection.capture();
    drag = {
      id: event.pointerId,
      p,
      start,
      view: frame.view,
      fit: frame.fit,
      mode: frame.mode,
      axis: event.target.closest("[data-axis]")?.dataset,
      moved: false,
    };
    if (frame.mode === "2d") {
      const target = overviewPoint(p.x, p.y, frame.fit),
        center = {
          x: (frame.view.x[0] + frame.view.x[1]) / 2,
          y: (frame.view.y[0] + frame.view.y[1]) / 2,
        };
      const inside = rects.some(
        (rect) =>
          p.x >= rect.x &&
          p.x <= rect.x + rect.width &&
          p.y >= rect.y &&
          p.y <= rect.y + rect.height,
      );
      if (frame.fit.periodic) {
        const period = frame.fit.right - frame.fit.left;
        target.x += Math.round((center.x - target.x) / period) * period;
      }
      drag.offset = inside
        ? { x: center.x - target.x, y: center.y - target.y }
        : { x: 0, y: 0 };
      if (!inside) move2d(p);
    }
    host.setPointerCapture(event.pointerId);
  }
  function move2d(p) {
    const target = overviewPoint(p.x, p.y, drag.fit);
    if (drag.fit.periodic) {
      const period = drag.fit.right - drag.fit.left,
        center = (drag.view.x[0] + drag.view.x[1]) / 2;
      target.x += Math.round((center - target.x) / period) * period;
    }
    const next = clampOverviewCenter(
      target.x + drag.offset.x,
      target.y + drag.offset.y,
      drag.view,
      drag.fit,
    );
    connection.move(next.x, next.y, drag.start);
  }
  function move(event) {
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    const p = point(event);
    drag.moved ||= Math.hypot(p.x - drag.p.x, p.y - drag.p.y) > 3;
    if (drag.mode === "2d") move2d(p);
    else if (drag.moved)
      connection.orbit(p.x - drag.p.x, p.y - drag.p.y, drag.start);
  }
  function finish(event, cancel = false) {
    if (!drag || drag.id !== event.pointerId) return;
    const previous = drag;
    drag = undefined;
    if (cancel) connection?.restore(previous.start);
    else if (previous.mode === "3d" && !previous.moved && previous.axis)
      connection?.align(Number(previous.axis.axis), Number(previous.axis.sign));
    if (host.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
  }
  function key(event) {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      finish({ pointerId: drag.id }, true);
      return;
    }
    if (
      !frame ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const dx =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0,
      dy = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
    if (frame.mode === "2d") {
      const amount = event.shiftKey ? 0.1 : 0.02;
      const next = clampOverviewCenter(
        (frame.view.x[0] + frame.view.x[1]) / 2 +
          dx * (frame.fit.right - frame.fit.left) * amount,
        (frame.view.y[0] + frame.view.y[1]) / 2 +
          dy * (frame.fit.top - frame.fit.bottom) * amount,
        frame.view,
        frame.fit,
      );
      connection.move(next.x, next.y);
    } else
      connection.orbit(
        dx * (event.shiftKey ? 30 : 8),
        -dy * (event.shiftKey ? 30 : 8),
        connection.capture(),
      );
  }
</script>

<!-- Two-axis navigation uses arrow keys and axis buttons; a one-dimensional slider role would be misleading. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="minimap"
  bind:this={host}
  style:width={`${width}px`}
  style:height={`${height}px`}
  style:--minimap-bg={frame?.theme?.background}
  style:--minimap-fg={frame?.theme?.text}
  role="application"
  aria-roledescription="plot navigation"
  tabindex="0"
  aria-label={frame?.mode === "3d" ? "3D navigation" : "Plot overview"}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={finish}
  onpointercancel={(e) => finish(e, true)}
  onlostpointercapture={(e) => finish(e, true)}
  onkeydown={key}
  ondblclick={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
>
  <canvas
    bind:this={canvas}
    class:hidden={frame?.mode !== "2d"}
    aria-hidden="true"
  ></canvas>
  {#if rects.length}<svg
      aria-hidden="true"
      viewBox={`0 0 ${frame.fit.width} ${frame.fit.height}`}
      >{#each rects as rect}<rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          class="viewport"
          stroke-width="1.25"
          vector-effect="non-scaling-stroke"
        />{/each}</svg
    >{/if}
  {#if frame?.mode === '2d' && frame.ticks}
    <svg class="mini-axes" aria-label="Overview axes">
      {#each ['x','y'] as axis}
        {#if frame.ticks[axis]}
          {#if axis === 'x'}<path d={`M${frame.fit.x} ${frame.fit.y+(frame.fit.top-frame.fit.bottom)*(frame.fit.scaleY ?? frame.fit.scale)} h${(frame.fit.right-frame.fit.left)*(frame.fit.scaleX ?? frame.fit.scale)}`} />{:else}<path d={`M${frame.fit.x} ${frame.fit.y} v${(frame.fit.top-frame.fit.bottom)*(frame.fit.scaleY ?? frame.fit.scale)}`} />{/if}
          {#each frame.ticks[axis].major.filter(t=>t.showLabel) as t}
            {#if axis === 'x'}<text x={frame.fit.x+t.fraction*(frame.fit.right-frame.fit.left)*(frame.fit.scaleX ?? frame.fit.scale)} y={frame.fit.y+(frame.fit.top-frame.fit.bottom)*(frame.fit.scaleY ?? frame.fit.scale)+14} text-anchor="middle">{t.label}</text>
            {:else}<text x={frame.fit.x-5} y={frame.fit.y+(1-t.fraction)*(frame.fit.top-frame.fit.bottom)*(frame.fit.scaleY ?? frame.fit.scale)+3} text-anchor="end">{t.label}</text>{/if}
          {/each}
        {/if}
      {/each}
    </svg>
  {/if}
  {#if frame?.mode === "3d"}
    <svg class="axes" aria-hidden="true" viewBox="0 0 100 100"
      >{#each frame.axes as a (a.label)}<line
          x1="50"
          y1="50"
          x2={50 + a.x * 31}
          y2={50 + a.y * 31}
          stroke={["#bd5260", "#39856b", "#537bad"][a.axis]}
          opacity={a.sign > 0 ? 1 : 0.4}
          stroke-width="2"
        />{/each}</svg
    >
    {#each frame.axes as a (a.label)}<button
        class="axis"
        data-axis={a.axis}
        data-sign={a.sign}
        style:left={`${50 + a.x * 31}%`}
        style:top={`${50 + a.y * 31}%`}
        style:--axis-color={["#bd5260", "#39856b", "#537bad"][a.axis]}
        style:z-index={Math.round((a.z + 1) * 10)}
        aria-label={`View from ${a.sign > 0 ? "positive" : "negative"} ${"XYZ"[a.axis]}`}
        onclick={(e) => {
          e.stopPropagation();
          if (e.detail === 0) connection?.align(a.axis, a.sign);
        }}>{a.label}</button
      >{/each}
  {/if}
</div>

{#if frame?.error}<span class="overview-error" role="status">Overview: {frame.error}</span>{/if}
<style>
  /* Colors from the plot's theme (--minimap-bg/-fg, TODO 61), else these defaults. */
  .mini-axes { font:10px "Source Sans 3", system-ui, sans-serif; fill:var(--minimap-fg, #5d6670); }
  .mini-axes path { stroke:color-mix(in srgb, var(--minimap-fg, #5d6670) 55%, var(--minimap-bg, #f7f8fb)); fill:none; stroke-width:1; }
  .viewport { fill:var(--minimap-fg, #73777d); fill-opacity:.18; stroke:var(--minimap-fg, #60656c); }
  .minimap {
    position: relative;
    max-width: 100%;
    max-height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--minimap-fg, #5d6670) 25%, var(--minimap-bg, #f7f8fb));
    border-radius: 8px;
    background: var(--minimap-bg, #f7f8fb);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: default;
    flex: none;
  }
  .minimap:focus-visible,
  .axis:focus-visible {
    outline: 2px solid #547ba2;
    outline-offset: 2px;
  }
  canvas,
  svg {
    position: absolute;
    width: 100%;
    height: 100%;
    inset: 0;
    pointer-events: none;
  }
  .hidden {
    display: none;
  }
  .axis {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--axis-color);
    color: var(--axis-color);
    background: var(--minimap-bg, #fff);
    font: 600 10px system-ui;
    padding: 0;
    cursor: pointer;
  }
  .axis:focus-visible { z-index:30 !important; }
  .axis:hover {
    background: color-mix(in srgb, var(--axis-color) 14%, var(--minimap-bg, white));
  }
</style>
