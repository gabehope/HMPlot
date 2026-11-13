// Triangulation: mapbox's earcut 3 on flat arrays (TODO 35: 1.8x three's port on a zoom-5 ocean
// tile with 1,900 island holes). "earcut3" aliases earcut@3: earcut 2 is another package's dependency.
import earcut from "earcut3";
import { geoFeatures } from "./geoData.js";
import { limitError } from "./limits.js";

const DETAIL_HINT = "Reduce source detail or the displayed domain.";

/** Geometry-only preprocessing. No numerical measurement tensors enter this module. */
export function geoGeometry(
  data,
  {
    geographic = false,
    projection = "equirectangular",
    angularStep = 5,
    linesOnly = false,
    polygonOutlines = true,
    maxBytes = 128 * 1024 * 1024,
    // The longitude of a single-extent map's center (a nested map): its
    // antimeridian at seamLongitude ± 180 bounds every emitted triangle and segment.
    seamLongitude = 0,
    // Flat geometry only (vector tiles, TODO 35): each polygon's top faces, without the bottom
    // faces and walls an extruded height needs, and without its boundary unless outlines draw.
    flat = false,
  } = {},
) {
  if (!Number.isFinite(angularStep) || angularStep <= 0)
    throw Error("Angular detail must be finite and positive.");
  if (!Number.isFinite(maxBytes) || maxBytes <= 0)
    throw Error("geoGeometry's maxBytes must be finite and positive.");
  const features = geoFeatures(data),
    cap = geographic && projection === "mercator" ? 85.0511287798066 : 90;
  // A feature's `tileClip` ([x0, y0, x1, y1], a vector tile's box: vectorTiles.js tileFeatures)
  // clips its triangles and outline edges, so a polygon triangulates whole (its holes valid)
  // and draws only inside its tile.
  const clipBoxes = features.map((f) => (Array.isArray(f?.tileClip) && f.tileClip.length === 4 &&
    f.tileClip.every(Number.isFinite) && f.tileClip[0] < f.tileClip[2] && f.tileClip[1] < f.tileClip[3] ? f.tileClip : null));
  const faces = { a: [], b: [], c: [], feature: [], part: [] },
    lines = { start: [], end: [], feature: [], part: [], outline: [] },
    points = { position: [], feature: [], part: [] },
    parts = [];
  let bytes = 0;
  const boundaries = [];
  const check = (n) => {
    bytes += n;
    if (bytes > maxBytes)
      throw limitError("storage", {
        component: "GeoJSON",
        what: "its geometry",
        count: bytes,
        limit: maxBytes,
        hint: DETAIL_HINT,
      });
  };
  const point = (p) => {
    if (
      !Array.isArray(p) ||
      p.length < 2 ||
      !p.slice(0, 2).every(Number.isFinite)
    )
      throw Error("coordinates must contain finite XY positions");
    if (geographic && Math.abs(p[1]) > 90)
      throw Error("latitude must be between -90 and 90 degrees");
    return [p[0], p[1]];
  };
  const clip = (vertices, axis, bound, above) => {
    const result = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i],
        b = vertices[(i + 1) % vertices.length],
        va = above ? a[axis] >= bound : a[axis] <= bound,
        vb = above ? b[axis] >= bound : b[axis] <= bound;
      if (va) result.push(a);
      if (va !== vb) {
        const t = (bound - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return result;
  };
  const emitFace = (a, b, c, f, part) => {
    check(80);
    faces.a.push(...a);
    faces.b.push(...b);
    faces.c.push(...c);
    faces.feature.push(f);
    faces.part.push(part);
  };
  const top = (a, b, c, f, part) => {
    const queue = [[a, b, c]];
    while (queue.length) {
      const t = queue.pop();
      let edge = 0,
        length = 0;
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3,
          d = Math.hypot(t[i][0] - t[j][0], t[i][1] - t[j][1]);
        if (d > length) {
          length = d;
          edge = i;
        }
      }
      if (geographic && length > angularStep) {
        if (queue.length * 64 + bytes > maxBytes)
          throw limitError("storage", {
            component: "GeoJSON",
            what: "subdividing its polygons",
            count: queue.length * 64 + bytes,
            limit: maxBytes,
            hint: DETAIL_HINT,
          });
        const i = edge,
          j = (i + 1) % 3,
          k = (i + 2) % 3,
          m = [(t[i][0] + t[j][0]) / 2, (t[i][1] + t[j][1]) / 2];
        queue.push([t[i], m, t[k]], [m, t[j], t[k]]);
        continue;
      }
      emitFace([...t[0], 1], [...t[1], 1], [...t[2], 1], f, part);
      if (!flat) emitFace([...t[0], 0], [...t[2], 0], [...t[1], 0], f, part);
    }
  };
  const clipSegment = (a, b, [x0, y0, x1, y1]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return t1 > t0 ? [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]] : null;
  };
  const triangle = (a, b, c, f, part) => {
    const box = clipBoxes[f];
    if (box) {
      let poly = [a, b, c];
      poly = clip(poly, 0, box[0], true);
      poly = clip(poly, 0, box[2], false);
      poly = clip(poly, 1, box[1], true);
      poly = clip(poly, 1, box[3], false);
      for (let i = 1; i + 1 < poly.length; i++) placeTriangle(poly[0], poly[i], poly[i + 1], f, part);
      return;
    }
    placeTriangle(a, b, c, f, part);
  };
  const placeTriangle = (a, b, c, f, part) => {
    if (!geographic) {
      top(a, b, c, f, part);
      return;
    }
    const lo = Math.floor((Math.min(a[0], b[0], c[0]) - seamLongitude + 180) / 360),
      hi = Math.floor((Math.max(a[0], b[0], c[0]) - seamLongitude + 180) / 360);
    if (hi - lo > 64)
      throw limitError("wrapCopies", {
        component: "GeoJSON",
        what: `feature ${features[f]?.id ?? f} (a polygon winding round the world)`,
        count: hi - lo + 1,
        limit: 65,
        hint: "Check its longitudes.",
      });
    for (let world = lo; world <= hi; world++) {
      let poly = [a, b, c];
      poly = clip(poly, 0, seamLongitude - 180 + 360 * world, true);
      poly = clip(poly, 0, seamLongitude + 180 + 360 * world, false);
      poly = clip(poly, 1, -cap, true);
      poly = clip(poly, 1, cap, false);
      poly = poly.map((p) => [p[0] - world * 360, p[1]]);
      for (let i = 1; i + 1 < poly.length; i++)
        top(poly[0], poly[i], poly[i + 1], f, part);
    }
  };
  const segment = (a, b, f, part, outline) => {
    const n = geographic
      ? Math.max(
          1,
          Math.ceil(
            Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) /
              Math.min(angularStep, 5),
          ),
        )
      : 1;
    const drawLine = !outline || polygonOutlines;
    const bytesPerSegment = (drawLine ? 40 : 0) + (outline && !linesOnly ? 160 : 0);
    if (n * bytesPerSegment + bytes > maxBytes)
      throw limitError("storage", {
        component: "GeoJSON",
        what: "subdividing its lines",
        count: n * bytesPerSegment + bytes,
        limit: maxBytes,
        hint: DETAIL_HINT,
      });
    for (let i = 0; i < n; i++) {
      let p = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n],
        q = [
          a[0] + ((b[0] - a[0]) * (i + 1)) / n,
          a[1] + ((b[1] - a[1]) * (i + 1)) / n,
        ];
      if (geographic) {
        if (Math.min(p[1], q[1]) > cap || Math.max(p[1], q[1]) < -cap) continue;
        for (const bound of [-cap, cap])
          if (p[1] < bound !== q[1] < bound) {
            const t = (bound - p[1]) / (q[1] - p[1]),
              at = [p[0] + t * (q[0] - p[0]), bound];
            if (p[1] < -cap || p[1] > cap) p = at;
            else if (q[1] < -cap || q[1] > cap) q = at;
          }
      }
      // A piece crossing the antimeridian splits there, so each half stays
      // in one longitude extent (a single-extent map never bridges it).
      // An end exactly on the antimeridian is not a crossing.
      const tile = (x) => Math.floor((x - seamLongitude + 180) / 360),
        pieces = [[p, q]],
        bound = seamLongitude - 180 + 360 * Math.max(tile(p[0]), tile(q[0]));
      if (geographic && (p[0] - bound) * (q[0] - bound) < 0) {
        const t = (bound - p[0]) / (q[0] - p[0]), m = [bound, p[1] + t * (q[1] - p[1])];
        pieces.splice(0, 1, [p, m], [m, q]);
      }
      for (let [from, to] of pieces) {
        const shift = geographic ? 360 * tile((from[0] + to[0]) / 2) : 0;
        from = [from[0] - shift, from[1]];
        to = [to[0] - shift, to[1]];
        if (drawLine) {
          check(40);
          lines.start.push(...from, outline ? 1 : 0);
          lines.end.push(...to, outline ? 1 : 0);
          lines.feature.push(f);
          lines.part.push(part);
          lines.outline.push(outline ? 1 : 0);
        }
        if (outline && !linesOnly && !flat) {
          emitFace([...from, 0], [...to, 0], [...to, 1], f, part);
          emitFace([...from, 0], [...to, 1], [...from, 1], f, part);
        }
      }
    }
  };
  const walk = (g, f, path) => {
    if (g === null) return;
    if (!g || typeof g.type !== "string") throw Error("invalid geometry");
    if (g.type === "GeometryCollection") {
      if (!Array.isArray(g.geometries))
        throw Error("GeometryCollection requires geometries");
      g.geometries.forEach((child, i) =>
        walk(child, f, [...path, "geometries", i]),
      );
      return;
    }
    const part = parts.push(path) - 1;
    const pathLine = (coordinates, outline = false) => {
      if (!Array.isArray(coordinates) || coordinates.length < 2)
        throw Error("line requires at least two positions");
      const p = coordinates.map(point);
      for (let i = 1; i < p.length; i++)
        segment(p[i - 1], p[i], f, part, outline);
    };
    const polygon = (rings) => {
      if (!Array.isArray(rings) || !rings.length)
        throw Error("polygon requires an exterior ring");
      const p = rings.map((r, i) => {
        if (!Array.isArray(r) || r.length < 4)
          throw Error("ring requires four positions including closure");
        const v = r.map(point);
        if (v[0][0] !== v.at(-1)[0] || v[0][1] !== v.at(-1)[1])
          throw Error("polygon ring must be closed");
        v.pop();
        if (
          geographic &&
          i === 0 &&
          v.reduce((a, p) => Math.max(a, p[0]), -Infinity) -
            v.reduce((a, p) => Math.min(a, p[0]), Infinity) >=
            359.999 &&
          v.reduce((a, p) => Math.max(a, p[1]), -Infinity) -
            v.reduce((a, p) => Math.min(a, p[1]), Infinity) <
            1e-8
        ) {
          const pole = v[0][1] < 0 ? -90 : 90;
          v.push([v.at(-1)[0], pole], [v[0][0], pole]);
        }
        const area = v.reduce((a, p, j) => {
          const q = v[(j + 1) % v.length];
          return a + p[0] * q[1] - q[0] * p[1];
        }, 0);
        if (area > 0 !== (i === 0)) v.reverse();
        return v;
      });
      if (!linesOnly) {
        const vertices = p.flat(), data = new Float64Array(vertices.length * 2), holes = [];
        let n = 0;
        p.forEach((ring, i) => {
          if (i) holes.push(n);
          for (const v of ring) { data[2 * n] = v[0]; data[2 * n + 1] = v[1]; n++; }
        });
        const indices = earcut(data, holes, 2);
        if (!indices.length && vertices.length)
          throw Error("polygon has no triangulatable area");
        for (let t = 0; t < indices.length; t += 3)
          triangle(vertices[indices[t]], vertices[indices[t + 1]], vertices[indices[t + 2]], f, part);
      }
      // A flat mesh without outlines needs no boundary (it only feeds outlines and walls).
      if (flat && !polygonOutlines) return;
      const box = clipBoxes[f];
      for (const ring of p)
        for (let i = 0; i < ring.length; i++) {
          const edge = box ? clipSegment(ring[i], ring[(i + 1) % ring.length], box) : [ring[i], ring[(i + 1) % ring.length]];
          if (edge) boundaries.push({ a: edge[0], b: edge[1], f, part });
        }
    };
    switch (g.type) {
      case "Point": {
        if (linesOnly) break;
        const p = point(g.coordinates);
        if (!geographic || Math.abs(p[1]) <= cap) {
          check(24);
          points.position.push(...p, 0);
          points.feature.push(f);
          points.part.push(part);
        }
        break;
      }
      case "MultiPoint":
        if (!Array.isArray(g.coordinates)) throw Error("invalid MultiPoint");
        g.coordinates.forEach((p, i) =>
          walk({ type: "Point", coordinates: p }, f, [
            ...path,
            "coordinates",
            i,
          ]),
        );
        break;
      case "LineString":
        pathLine(g.coordinates);
        break;
      case "MultiLineString":
        if (!Array.isArray(g.coordinates))
          throw Error("invalid MultiLineString");
        g.coordinates.forEach((p, i) =>
          walk({ type: "LineString", coordinates: p }, f, [
            ...path,
            "coordinates",
            i,
          ]),
        );
        break;
      case "Polygon":
        polygon(g.coordinates);
        break;
      case "MultiPolygon":
        if (!Array.isArray(g.coordinates)) throw Error("invalid MultiPolygon");
        g.coordinates.forEach((p, i) =>
          walk({ type: "Polygon", coordinates: p }, f, [
            ...path,
            "coordinates",
            i,
          ]),
        );
        break;
      default:
        throw Error(`unsupported geometry type ${g.type}`);
    }
  };
  features.forEach((f, i) => {
    try {
      walk(f.geometry, i, []);
    } catch (e) {
      // A limit error (limits.js) names the component and the size already.
      if (String(e.code).startsWith("limit.")) throw e;
      throw Error(`GeoJSON feature ${f.id ?? i}: ${e.message}`);
    }
  });

  const seam = (e) =>
    geographic &&
    Math.abs(Math.abs(e.a[0]) - 180) < 1e-8 &&
    Math.abs(e.a[0] - e.b[0]) < 1e-8;
  const cuts = boundaries.filter(seam);
  for (const e of boundaries) {
    if (!seam(e)) {
      segment(e.a, e.b, e.f, e.part, true);
      continue;
    }
    const lo = Math.min(e.a[1], e.b[1]),
      hi = Math.max(e.a[1], e.b[1]);
    const opposite = cuts.filter(
      (q) => q.f === e.f && Math.abs(q.a[0] + e.a[0]) < 1e-8,
    );
    const ticks = [
      lo,
      hi,
      ...opposite
        .flatMap((q) => [q.a[1], q.b[1]])
        .filter((y) => y > lo && y < hi),
    ].sort((a, b) => a - b);
    for (let i = 1; i < ticks.length; i++) {
      const mid = (ticks[i - 1] + ticks[i]) / 2;
      if (
        opposite.some(
          (q) =>
            mid >= Math.min(q.a[1], q.b[1]) && mid <= Math.max(q.a[1], q.b[1]),
        )
      )
        continue;
      const a = [e.a[0], ticks[i - 1]],
        b = [e.a[0], ticks[i]];
      segment(
        e.a[1] <= e.b[1] ? a : b,
        e.a[1] <= e.b[1] ? b : a,
        e.f,
        e.part,
        true,
      );
    }
  }
  for (const group of [faces, lines, points])
    for (const key of Object.keys(group))
      group[key] = new (
        ["feature", "part"].includes(key) ? Uint32Array : Float32Array
      )(group[key]);
  return { faces, lines, points, parts, featureCount: features.length, bytes };
}
