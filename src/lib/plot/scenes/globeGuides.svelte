<script>
  // A 2D orthographic globe's graticule and reference rules on the GPU (TODO 141): each line is
  // short segments in source angular units, built once per zoom level, and the vertex shader
  // projects them through the live projection center (coordinateNodes.js, as marks are),
  // cutting each segment at the horizon (as GeoSegments does). Rotating the globe changes two uniforms and zooming
  // changes the camera; neither builds geometry nor reads options per vertex. Geometry is
  // rebuilt only when the lines' definition changes or the zoom passes a power of two that
  // changes how many segments keep each chord within a quarter pixel. Labels and the outline stay
  // in the overlay (axisOverlayContent.svelte); vector export samples these lines at its own
  // resolution (vectorExport/twoDimensional.js, "globe-guides").
  import { T, useThrelte } from "@threlte/core";
  import { onDestroy, untrack } from "svelte";
  import { Color, Group, InstancedBufferAttribute, Mesh } from "three/webgpu";
  import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
  import { attribute, cameraProjectionMatrix, float, mix, reference, uniform, vec3 } from "three/tsl";
  import { LineNodeMaterial } from "../../threeExtensions/materials/lines.js";
  import { interleaveGeometry } from "../utils/vertexBuffers.js";
  import { coordinatePoint, orthographicFacing } from "../utils/coordinateNodes.js";
  import { angularFactor } from "../utils/coordinates.js";
  import { globeGuideLines } from "../utils/orthographicGuides.js";
  import { gridColors } from "../utils/axisColors.js";
  import { resolveAxisStyle } from "../utils/axisStyle.js";

  /** `options`: the root frame's; `placement`: which axes show. */
  let { options: frameOptions, placement, active, width, height } = $props();
  // The Axis's options: one object for its life.
  const options = untrack(() => frameOptions);
  const { invalidate } = useThrelte();
  const styles = options.child("plot");
  let revision = $state(0), styleRevision = $state(0), detail = $state(64);
  // What the lines and their projection depend on. The projection center is a uniform.
  const stops = [
    ...["projection", "coordinates", "angleUnit", "anglePeriod", "xbounds"]
      .map((key) => options.on(() => revision++, key)),
    styles.on(() => styleRevision++),
  ];
  const group = new Group();
  group.userData.omitOverview = true;
  /** @type {Mesh[]} */
  let meshes = [];

  /**
   * Segments per period (a power of two) at which a segment's chord stays within a quarter pixel
   * of its arc on a globe of `pixelRadius` CSS pixels: an angle θ has sagitta r θ² / 8, so θ <=
   * sqrt(2 / r). 64 (5.6°) at a 200 px radius, 1,024 at 20,000; at most 16,384.
   */
  function detailFor(pixelRadius) {
    const needed = 2 * Math.PI / Math.sqrt(2 / Math.max(1, pixelRadius));
    return Math.min(16384, Math.max(32, 2 ** Math.ceil(Math.log2(needed))));
  }

  /** One mesh's instance buffers: each segment's two ends as [lon, lat, arc] (arc: radians along
   * its line from its start, for dashes), its color and its width. */
  function segmentsOf(lines, factor, level) {
    const period = 2 * Math.PI / factor, step = period / level;
    const starts = [], ends = [], colors = [], widths = [];
    for (const line of lines) {
      const span = line.end - line.start, count = Math.max(1, Math.ceil(Math.abs(span) / step));
      const c = new Color(line.color);
      for (let i = 0; i < count; i++) {
        const a = line.start + span * i / count, b = line.start + span * (i + 1) / count;
        if (line.axis === "x") {
          starts.push(line.value, a, (a - line.start) * factor);
          ends.push(line.value, b, (b - line.start) * factor);
        } else {
          // A parallel's arc on the sphere is shorter by its latitude's cosine.
          const shrink = Math.cos(line.value * factor);
          starts.push(a, line.value, (a - line.start) * factor * shrink);
          ends.push(b, line.value, (b - line.start) * factor * shrink);
        }
        colors.push(c.r, c.g, c.b, line.opacity);
        widths.push(line.width);
      }
    }
    return { starts, ends, colors, widths, count: widths.length };
  }

  /**
   * A guide material, made once per role (the graticule, or a rule's dash pattern) and kept
   * across rebuilds: its nodes read the segments by attribute name, so a zoom's new geometry
   * reuses its pipeline, and only a new projection or angle unit (`revision`) remakes it.
   */
  function guideMaterial(dash) {
    const material = new LineNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
    material.connected = false;
    const mark = { options }, renderScale = uniform(1);
    const a = attribute("guideStart", "vec3"), b = attribute("guideEnd", "vec3");
    const pointA = vec3(a.x, a.y, 0), pointB = vec3(b.x, b.y, 0);
    const start = coordinatePoint(mark, pointA, { unclipped: true, clipLatitude: false }).position,
      end = coordinatePoint(mark, pointB, { unclipped: true, clipLatitude: false }).position;
    // Orthographic projection is linear in 3D: the facing's zero along the chord is at
    // t = fa / (fa - fb), at the same mix of the projected ends (GeoSegments.build).
    const fa = orthographicFacing(mark, pointA), fb = orthographicFacing(mark, pointB),
      difference = fa.sub(fb),
      t = fa.div(difference.abs().lessThan(1e-12).select(float(1e-12), difference)).clamp(0, 1),
      cut = mix(start, end, t);
    material.startNode = fa.lessThan(0).select(cut, start);
    material.endNode = fb.lessThan(0).select(cut, end);
    material.lineWidthNode = fa.lessThan(0).and(fb.lessThan(0))
      .select(float(0), attribute("guideWidth", "float").mul(renderScale));
    const color = attribute("guideColor", "vec4");
    material.lineColorNode = color.rgb;
    material.opacityNode = color.a;
    if (dash) {
      // Dashes measured along the sphere's surface, in viewport heights (the material's unit):
      // a pattern painted on the globe, foreshortened toward the limb, that never slides as the
      // globe turns. World units to viewport heights: the camera's y scale over 2.
      const toViewport = reference("baseRadius", "float", options.transformed)
        .mul(cameraProjectionMatrix.element(1).element(1)).mul(0.5);
      material.dashed = true;
      material.distanceStartNode = a.z.mul(toViewport);
      material.distanceEndNode = b.z.mul(toViewport);
      material.dashSizeNode = float(dash[0]).mul(renderScale);
      material.gapSizeNode = float(dash[1]).mul(renderScale);
    }
    return { material, renderScale };
  }
  /** @type {Map<string, {material: LineNodeMaterial, renderScale: any, revision: number}>} */
  const materials = new Map();
  function materialFor(key, dash) {
    let entry = materials.get(key);
    if (entry?.revision !== revision) {
      entry?.material.dispose();
      entry = { ...guideMaterial(dash), revision };
      materials.set(key, entry);
    }
    return entry;
  }

  // Each role's geometry per zoom level, for the current lines: zooming back to a level reuses it.
  /** @type {Map<string, LineSegmentsGeometry>} */
  const geometries = new Map();
  function releaseGeometries() {
    for (const geometry of geometries.values()) geometry.dispose();
    geometries.clear();
  }
  function geometryFor(cacheKey, make) {
    let geometry = geometries.get(cacheKey);
    if (geometry) return geometry;
    const segments = make();
    geometry = interleaveGeometry(new LineSegmentsGeometry());
    const buffer = (values, size) => new InstancedBufferAttribute(new Float32Array(values), size);
    geometry.setAttribute("guideStart", buffer(segments.starts, 3));
    geometry.setAttribute("guideEnd", buffer(segments.ends, 3));
    geometry.setAttribute("guideColor", buffer(segments.colors, 4));
    geometry.setAttribute("guideWidth", buffer(segments.widths, 1));
    geometry.instanceCount = segments.count;
    geometries.set(cacheKey, geometry);
    return geometry;
  }

  function makeMesh(geometry, { key, dash = null, foreground = false }) {
    const { material, renderScale } = materialFor(key, dash);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    // The graticule lies under every mark as a Cartesian grid does; reference rules over them
    // (axisRules.svelte's two passes).
    mesh.renderOrder = foreground ? 1000000 : -1000000;
    mesh.userData.omitOverview = true;
    // Scaled with CSS-sized marks in a higher-resolution pass (antialias.js withRenderScale).
    mesh.renderScaleNode = renderScale;
    return mesh;
  }

  function release() {
    for (const mesh of meshes) group.remove(mesh);
    meshes = [];
  }

  // Booleans, so a placement rebuilt with the same values (each layout pass) rebuilds nothing.
  const showX = $derived(placement?.x?.show !== false), showY = $derived(placement?.y?.show !== false);
  const shows = $derived({ x: showX, y: showY });
  // The lines with their drawn style: as the overlay drew them (TODO 135.5), the axis line's
  // color at .28 (major) and .12 (minor) opacity, and each rule its own color, width and dash.
  const styled = $derived.by(() => {
    revision;
    styleRevision;
    if (!active || !(width > 0 && height > 0)) return null;
    const lines = globeGuideLines(options, { width, height });
    const shared = { axisLineWidth: styles.get("axisLineWidth") };
    const stroke = styles.get("axisLineColor") ?? styles.get("axisTextColor") ?? "#394458";
    const grid = gridColors(styles.get("background"), styles.get("axisTextColor"));
    const graticule = [], rules = [];
    for (const axis of ["x", "y"]) {
      if (!shows[axis]) continue;
      const lineWidth = resolveAxisStyle(lines.configs[axis], shared).lineWidth;
      for (const line of lines[axis].minor)
        graticule.push({ ...line, color: stroke, opacity: 0.12, width: Math.max(0.5, lineWidth * 0.7), minor: true });
      for (const line of lines[axis].major) graticule.push({ ...line, color: stroke, opacity: 0.28, width: lineWidth });
      for (const rule of lines[axis].reference) {
        if (rule.width === 0) continue;
        rules.push({ ...rule, color: rule.color ?? grid.major, opacity: 1, width: rule.width ?? 1 });
      }
    }
    return { graticule, rules };
  });

  let built = null;
  $effect(() => {
    const lines = styled, level = detail;
    untrack(() => {
      release();
      // New lines: the cached levels are of the old ones.
      if (lines !== built) releaseGeometries();
      built = lines;
      if (!lines) { invalidate(); return; }
      const factor = angularFactor(options);
      const add = (mesh, drawn, layer) => {
        // Vector export samples the same lines at its resolution (twoDimensional.js).
        Object.assign(mesh, { exportKind: "globe-guides", exportLines: drawn, exportLayer: layer, frameOptions: options });
        // The zoom's detail, checked as the mesh draws: a rebuild only past a power of two.
        mesh.onBeforeRender = (renderer, scene, camera) => {
          const pixels = height * Math.abs(camera.projectionMatrix.elements[5]) / 2 * Number(options.get("baseRadius") ?? 1);
          const next = detailFor(pixels);
          if (next !== detail) detail = next;
        };
        meshes.push(mesh);
        group.add(mesh);
      };
      if (lines.graticule.length)
        add(makeMesh(geometryFor(`graticule:${level}`, () => segmentsOf(lines.graticule, factor, level)), { key: "graticule" }),
          lines.graticule, "background");
      // A rule's dash is per material: a few rules, one draw each.
      lines.rules.forEach((rule, index) => {
        const dash = rule.dash?.length ? (rule.dash.length % 2 ? [...rule.dash, ...rule.dash] : rule.dash) : null;
        const geometry = geometryFor(`rule${index}:${level}`, () => segmentsOf([rule], factor, level));
        add(makeMesh(geometry, { key: `rule:${dash ?? ""}`, dash, foreground: true }), [rule], "foreground");
      });
      invalidate();
    });
  });

  onDestroy(() => {
    stops.forEach((stop) => stop());
    release();
    releaseGeometries();
    for (const { material } of materials.values()) material.dispose();
    materials.clear();
  });
</script>

<T is={group} visible={active} />
