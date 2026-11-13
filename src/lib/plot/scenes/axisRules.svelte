<script>
  import { useThrelte, T } from "@threlte/core";
  import { onDestroy, untrack } from "svelte";
  import {
    BufferGeometry,
    BufferAttribute,
    MeshBasicNodeMaterial,
    Color,
    DoubleSide,
  } from "three/webgpu";
  import { vec4, positionGeometry, attribute } from "three/tsl";
  import { getOptionsContext } from "../utils/context.js";
  import { gridColors } from "../utils/axisColors.js";
  import { globe2D } from "../utils/axisStyle.js";
  import { polarBands } from "../utils/axes.js";
  import { framePoint, framePointOperations } from "../utils/framePlacement.js";
  let { layout, width, height, active, placement, references = false } = $props();
  // Grid rules follow the theme: the axis text color blended into the plot background.
  const frameOptions = getOptionsContext(), plotStyle = frameOptions?.child?.("plot");
  let styleRevision = $state(0);
  const stopStyle = plotStyle?.on?.(() => styleRevision++);
  onDestroy(() => stopStyle?.());
  const { invalidate } = useThrelte();
  let geometry = $state.raw(new BufferGeometry());
  let mesh = $state.raw();
  let capacity = $state(0);
  let drawCount = $state(0);
  // Bands (TODO 46) and grid lines in one draw: bands first, translucent (rgba per vertex), so they
  // lie under the grid lines and every mark.
  const material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  material.vertexNode = vec4(positionGeometry.xy, 0, 1);
  material.colorNode = attribute("ruleColor", "vec4").rgb;
  material.outputNode = attribute("ruleColor", "vec4");
  // A polar frame's bands are sectors in world space, mapped through the frame chain.
  let polarGeometry = $state.raw(new BufferGeometry());
  let polarMesh = $state.raw();
  const polarMaterial = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, side: DoubleSide, toneMapped: false, transparent: true });
  polarMaterial.colorNode = attribute("bandColor", "vec4").rgb;
  polarMaterial.opacityNode = attribute("bandColor", "vec4").a;
  const bandColor = (band) => band.color ?? plotStyle?.get("axisTextColor") ?? "#394458";
  const bandOpacity = (band) => band.opacity ?? 0.1;
  $effect(() => {
    styleRevision;
    const sectors = !references && active && layout?.polar && frameOptions ? polarBands(frameOptions) : [];
    const positions = [], colors = [], outlines = [];
    if (sectors.length) {
      const context = { operations: framePointOperations(frameOptions) }, world = (p) => framePoint(frameOptions, [p[0], p[1], 0], context);
      for (const band of sectors) {
        const c = new Color(bandColor(band)), alpha = bandOpacity(band),
          outer = band.outer.map(world), inner = band.inner.map(world);
        for (let i = 0; i + 1 < outer.length; i++)
          for (const point of [outer[i], outer[i + 1], inner[i + 1], outer[i], inner[i + 1], inner[i]]) {
            positions.push(point[0], point[1], point[2] ?? 0);
            colors.push(c.r, c.g, c.b, alpha);
          }
        outlines.push({ points: [...band.outer, ...[...band.inner].reverse()], color: bandColor(band), opacity: alpha });
      }
    }
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    next.setAttribute("bandColor", new BufferAttribute(new Float32Array(colors), 4));
    untrack(() => {
      const old = polarGeometry;
      polarGeometry = next;
      old.dispose();
    });
    if (polarMesh) Object.assign(polarMesh, { exportKind: "axis-bands", exportPolygons: outlines, frameOptions });
    invalidate();
  });
  // Grid and bands stay behind marks; explicit references are a separate foreground pass.
  // Both use the same CPU geometry and vector-export path, without data-array readbacks.
  $effect(() => {
    styleRevision;
    const grid = gridColors(plotStyle?.get("background"), plotStyle?.get("axisTextColor"));
    const lines = [], bands = [];
    // A polar frame's and a globe's grids are curved: the overlay draws them (TODO 135.5).
    if (active && layout && !layout.polar && !globe2D(frameOptions ?? {}) && width > 0 && height > 0) {
      const { left, right, top, bottom } = layout;
      for (const axis of ["x", "y"]) {
        if(placement?.[axis]?.show===false)continue;
        const a = layout[axis];
        if (!a) continue;
        for (const band of references ? [] : a.bands ?? []) {
          const [p0, p1] = axis === "x" ? band.fractions.map((f) => f * width) : band.fractions.map((f) => (1 - f) * height).reverse();
          const rect = axis === "x"
            ? { x0: Math.max(left, p0), x1: Math.min(right, p1), y0: top, y1: bottom }
            : { x0: left, x1: right, y0: Math.max(top, p0), y1: Math.min(bottom, p1) };
          if (rect.x1 > rect.x0 && rect.y1 > rect.y0) bands.push({ ...rect, color: bandColor(band), opacity: bandOpacity(band) });
        }
        const ticks =
          a.config.grid === "off"
            ? []
            : a.config.grid === "major"
              ? a.major
              : [...a.minor.map((t) => ({ ...t, minor: true })), ...a.major];
        const position = (t) => (axis === "x" ? t.fraction : 1 - t.fraction) * (axis === "x" ? width : height);
        const seen = new Set(references ? [] : a.reference.map((t) => Math.round(position(t) * 2)));
        // Explicit references replace coincident grid rules.
        for (const t of references ? a.reference : ticks.map(t => ({ ...t, width: a.config.gridWidth, color: a.config.gridColor, dash: a.config.gridDash }))) {
          const p = position(t);
          if (
            p < (axis === "x" ? left : top) ||
            p > (axis === "x" ? right : bottom)
          )
            continue;
          const key = Math.round(p * 2);
          if (seen.has(key)) continue;
          seen.add(key);
          lines.push({
            axis,
            p,
            start: axis === "x" ? top : left,
            end: axis === "x" ? bottom : right,
            width: t.width ?? 1,
            color: t.color ?? (references ? plotStyle?.get("axisTextColor") ?? "#394458" : t.minor ? grid.minor : grid.major),
            dash: t.dash,
          });
        }
      }
    }
    const verts = [],
      colors = [];
    if(mesh){mesh.exportKind="axis-rules";mesh.exportLines=lines;mesh.exportBands=bands;}
    for (const band of bands) {
      const c = new Color(band.color);
      for (const [x, y] of [[band.x0, band.y0], [band.x1, band.y0], [band.x1, band.y1], [band.x0, band.y0], [band.x1, band.y1], [band.x0, band.y1]]) {
        verts.push((x / width) * 2 - 1, 1 - (y / height) * 2, 0);
        colors.push(c.r, c.g, c.b, band.opacity);
      }
    }
    for (const line of lines) {
      if (!line.width) continue;
      const c = new Color(line.color),
        half = line.width / 2;
      const emit = (start, end) => {
        let x0, x1, y0, y1;
        if (line.axis === "x") {
          x0 = line.p - half;
          x1 = line.p + half;
          y0 = start;
          y1 = end;
        } else {
          x0 = start;
          x1 = end;
          y0 = line.p - half;
          y1 = line.p + half;
        }
        x0 = Math.max(layout.left, x0);
        x1 = Math.min(layout.right, x1);
        y0 = Math.max(layout.top, y0);
        y1 = Math.min(layout.bottom, y1);
        for (const [x, y] of [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y0],
          [x1, y1],
          [x0, y1],
        ]) {
          verts.push((x / width) * 2 - 1, 1 - (y / height) * 2, 0);
          colors.push(c.r, c.g, c.b, 1);
        }
      };
      if (line.dash?.length) {
        const dash =
          line.dash.length % 2 ? [...line.dash, ...line.dash] : line.dash;
        let p = line.start,
          index = 0;
        // Subpixel dashes become a continuous rule before allocating geometry.
        if (Math.min(...dash) < 1) emit(line.start, line.end);
        else
          while (p < line.end) {
            const next = Math.min(line.end, p + dash[index % dash.length]);
            if (index % 2 === 0) emit(p, next);
            p = next;
            index++;
          }
      } else emit(line.start, line.end);
    }
    const count = verts.length / 3;
    drawCount = count;
    if (count > capacity) {
      capacity = 2 ** Math.ceil(Math.log2(Math.max(16, count)));
      const next = new BufferGeometry();
      next.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(capacity * 3), 3),
      );
      next.setAttribute(
        "ruleColor",
        new BufferAttribute(new Float32Array(capacity * 4), 4),
      );
      const old = geometry;
      geometry = next;
      material.needsUpdate = true;
      old.dispose();
    }
    if (capacity) {
      geometry.attributes.position.array.set(verts);
      geometry.attributes.ruleColor.array.set(colors);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.ruleColor.needsUpdate = true;
      geometry.setDrawRange(0, count);
    }
    invalidate();
  });
  onDestroy(() => {
    geometry.dispose();
    material.dispose();
    polarGeometry.dispose();
    polarMaterial.dispose();
  });
</script>

<T.Mesh
  bind:ref={polarMesh}
  userData={{omitOverview:true}}
  geometry={polarGeometry}
  material={polarMaterial}
  visible={active && polarGeometry.attributes.position?.count > 0}
  renderOrder={-1000001}
  frustumCulled={false}
/>

<T.Mesh
  bind:ref={mesh}
  userData={{omitOverview:true}}
  {geometry}
  {material}
  visible={active && drawCount > 0}
  renderOrder={references ? 1000000 : -1000000}
  frustumCulled={false}
/>
