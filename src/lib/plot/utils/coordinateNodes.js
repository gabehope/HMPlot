import {
  Fn,
  uv,
  If,
  float,
  vec2,
  vec3,
  reference,
  sin,
  cos,
  atan,
  asin,
  acos,
  log,
  tan,
  mod,
  mix,
} from "three/tsl";
import { spherical, angularFactor, longitudeOrigin, MERCATOR_LIMIT } from "./coordinates.js";
import { buildCoordinateOperations } from "./coordinateOperations.js";
import { interpolationOf } from "./curves.js";
import { jointProjection, jointNode, conicNodes } from "./mapProjections.js";
import { isFinitePoint } from "./mappedValidity.js";
import { coordinateView } from "./viewContext.js";
const PI = Math.PI;
/** Whether the mark's coordinates continue through ancestors (a ranged,
 * placed or parent-mapped Frame). Such a path interpolates in its own source
 * space and then takes the whole ordered chain; a lone root operation keeps
 * its unwrapped repeating-map form. */
export function chainedCoordinates(options) {
  try { return buildCoordinateOperations(options).filter(operation => !operation.display).length > 1; }
  catch { return false; }
}
/** A path point at parameter t. `middle`: the parameter of the middle of the refined piece t
 * belongs to. On a root joint map (equal-earth, albers, ...) the piece's ends wrap into the
 * middle's extent: the refinement cut the piece at the seam, and an end computed a hair past
 * it (f32) must not wrap to the map's other edge. */
/** On the validity contract (mappedValidity.js): {position, valid}, valid false where the chain
 * cannot map the point or it is not finite.
 * @returns {import("./mappedValidity.js").MappedPoint} */
export function pathPosition(mark, a, b, t, middle = null) {
  const curve=mark.options.get('curve')??'linear', chained=chainedCoordinates(mark.options);
  // On the contract: a chain's own mapping, or a root spherical one (finite as well).
  const frame = (p, settings) => mark.mapPosition(vec3(0), p, settings);
  const root = (p, settings) => { const q = coordinatePoint(mark, p, settings);
    return { position: q.position, valid: q.valid.and(isFinitePoint(q.position)) }; };
  const tolerant = { tolerant: true };
  // A root joint map does not repeat: its paths are cut at the seam and map wrapped.
  const joint = jointProjection(mark.options.get('projection')), unwrap = !joint;
  if(curve!=='linear'){
    const p=curvePointNode(mark,a,b,t);
    return spherical(mark.options)&&!chained?root(p,{unwrap,tolerant:true,
      wrapNear:joint&&middle?curvePointNode(mark,a,b,middle):null}):frame(p,tolerant);
  }
  if (!spherical(mark.options)) return frame(mix(a, b, t), tolerant);
  if (interpolationOf(mark) !== "cartesian")
    return chained ? frame(pathPointNode(mark, a, b, t), tolerant)
      : root(pathPointNode(mark, a, b, t), {
        unwrap,
        clipLatitude: false,
        tolerant: true,
        wrapNear: joint && middle ? pathPointNode(mark, a, b, middle) : null,
      });
  const o = mark.options,
    f = angularFactor(o), origin = longitudeOrigin(o),
    r = (p) => p.z.mul(o.get("radialScale")).add(o.get("baseRadius")),
    q = mix(directionNode(a, f, origin).mul(r(a)), directionNode(b, f, origin).mul(r(b)), t);
  const globe = coordinateView(o) === "3d" &&
    o.get("sphericalView") !== "projected";
  // The chord is already in the local globe's canonical space.
  if (globe) return chained ? frame(q, { first: 1, tolerant: true }) : { position: q, valid: isFinitePoint(q) };
  const len = q.length().max(1e-20),
    lon = atan(q.x, q.z),
    p = vec3(
      lon.div(f).add(origin),
      asin(q.y.div(len).clamp(-1, 1)).div(f),
      len.sub(o.get("baseRadius")).div(Math.max(1e-20, o.get("radialScale"))),
    );
  return chained ? frame(p, tolerant)
    : root(p, { unwrap, clipLatitude: false, tolerant: true });
}

export function directionNode(p, f, origin = 0) {
  const l = p.x.sub(origin).mul(f),
    lat = p.y.mul(f);
  return vec3(lat.cos().mul(l.sin()), lat.sin(), lat.cos().mul(l.cos()));
}

function centeredOrthographicBasis(options, factor, origin) {
  const longitude = reference("_projectionCenterLongitude", "float", options.transformed).sub(origin).mul(factor),
    latitude = reference("_projectionCenterLatitude", "float", options.transformed).mul(factor);
  const sl = longitude.sin(), cl = longitude.cos();
  const sp = latitude.sin(), cp = latitude.cos();
  return {
    east: vec3(cl, 0, sl.negate()),
    north: vec3(sp.mul(sl).negate(), cp, sp.mul(cl).negate()),
    outward: vec3(cp.mul(sl), sp, cp.mul(cl)),
  };
}
/** `tolerant`: a refined path or fill vertex. The refinement pass already cut
 * the geometry at a horizon, zero radius or Mercator limit; its cut point may
 * round just past that boundary here, and must still map (to the boundary). */
/** @param {{options: import("./frameNodes.js").ShaderOptions,
 * longitudeShift?: number | import("three/webgpu").Node<"float">}} mark
 * @param {import("three/webgpu").Node<"vec3">} p
 * @param {{unwrap?: boolean, clipLatitude?: boolean,
 * coordinateOptions?: import("./frameNodes.js").ShaderOptions, tolerant?: boolean,
 * unclipped?: boolean, joint?: Partial<ReturnType<typeof jointNodes>> | null,
 * wrapNear?: import("three/webgpu").Node<"vec3"> | null}} [settings]
 * A spherical or polar point on the validity contract (mappedValidity.js): the projected
 * point, whether or not it is valid (behind a horizon it keeps its projection), and whether the
 * projection maps it.
 * @returns {{position: import("three/webgpu").Node<"vec3">, valid: import("three/webgpu").Node<"bool">}}
 */
export function coordinatePoint(
  mark,
  p,
  { unwrap = false, clipLatitude = true, coordinateOptions = mark.options, tolerant = false,
    unclipped = false, joint: jointCollector = null, wrapNear = null } = {},
) {
  const o = coordinateOptions, margin = tolerant ? 1e-4 : 0;
  if (o.get("coordinates") === "polar") {
    const unit = o.get("angleUnit"), bounds = reference("xbounds", "vec2", o.transformed);
    const factor = unit === "custom"
      ? float(2 * PI).div(reference("anglePeriod", "float", o.transformed))
      : unit === "extent" ? float(2 * PI).div(bounds.y.sub(bounds.x))
        : float(unit === "radians" ? 1 : PI / 180);
    const angle = p.x.sub(unit === "extent" ? bounds.x : 0).mul(factor),
      signedRadius = reference("baseRadius", "float", o.transformed).add(
        p.y.mul(reference("radialScale", "float", o.transformed))),
      radius = tolerant ? signedRadius.max(0) : signedRadius,
      x = radius.mul(angle.cos()), y = radius.mul(angle.sin()),
      axis = o.get("polarAxis");
    const point = axis === "X" ? vec3(p.z, x, y)
      : axis === "Y" ? vec3(y, p.z, x) : vec3(x, y, p.z);
    return { position: point, valid: signedRadius.greaterThanEqual(-margin).and(angle.abs().lessThan(1e30)) };
  }
  const
    f = angularFactor(o), origin = longitudeOrigin(o),
    r = reference("baseRadius", "float", o.transformed).add(
      p.z.mul(reference("radialScale", "float", o.transformed)),
    ),
    lat = p.y.mul(f),
    lon = p.x.sub(origin).mul(f);
  let valid = lat
    .abs()
    .lessThanEqual(
      clipLatitude &&
        (coordinateView(o) === "2d" ||
          o.get("sphericalView") === "projected") &&
        o.get("projection") === "mercator"
        ? MERCATOR_LIMIT + 1e-6 + margin
        : PI / 2 + 1e-6 + margin,
    )
    .and(r.greaterThan(0))
    .and(lon.abs().lessThan(1e30));
  let point;
  if (
    coordinateView(o) === "3d" &&
    o.get("sphericalView") !== "projected"
  )
    point = directionNode(p, f, origin).mul(r);
  else {
    const projection =
      coordinateView(o) === "chart"
        ? "equirectangular"
        : o.get("projection");
    if(projection==='orthographic'){
      const basis=centeredOrthographicBasis(o,f,origin),direction=directionNode(p,f,origin),
        front=direction.dot(basis.outward).greaterThanEqual(-1e-7-margin),
        x=r.mul(direction.dot(basis.east)),y=r.mul(direction.dot(basis.north));
      point=coordinateView(o)==='3d'
        ?vec3(x,p.z.mul(reference('radialScale','float',o.transformed)),y.negate())
        :vec3(x,y,0);
      // Unclipped: a back point keeps its projection, for a caller that cuts
      // at the horizon itself (orthographic projection is linear in 3D).
      return { position: point, valid: unclipped ? valid : valid.and(front) };
    }
    if (jointProjection(projection)) {
      // A joint projection (TODO 39.5): λ relative to the live center longitude, wrapped to the
      // map's one extent unless the caller keeps it unwrapped (a raster masks its seam itself).
      const joint = jointNodes(o, lon, lat, f, origin, { unwrap,
        near: wrapNear ? wrapNear.x.sub(origin).mul(f) : null });
      // A `joint` collector (a raster) receives λ and the projection's output and cuts at the
      // seam and off the map itself; its vertices keep their projection (as `unclipped` does).
      if (jointCollector) Object.assign(jointCollector, joint);
      if (!unclipped) valid = valid.and(joint.xy.z.greaterThan(0.5));
      point = coordinateView(o) === "3d"
        ? vec3(joint.xy.x.mul(reference("baseRadius", "float", o.transformed)),
          p.z.mul(reference("radialScale", "float", o.transformed)),
          joint.xy.y.negate().mul(reference("baseRadius", "float", o.transformed)))
        : vec3(joint.xy.x, joint.xy.y, 0);
      return { position: point, valid };
    }
    const x = unwrap ? lon : mod(lon.add(PI), 2 * PI).sub(PI);
    let y = lat;
    if (projection === "mercator")
      y = log(
        tan(
          lat
            .clamp(-MERCATOR_LIMIT, MERCATOR_LIMIT)
            .div(2)
            .add(PI / 4),
        ),
      );
    if (projection === "equal-area") y = lat.sin();
    point =
      coordinateView(o) === "3d"
        ? vec3(
            x.mul(reference("baseRadius", "float", o.transformed)),
            p.z.mul(reference("radialScale", "float", o.transformed)),
            y.negate().mul(reference("baseRadius", "float", o.transformed)),
          )
        : vec3(x.add(mark.longitudeShift ?? 0), y, 0);
  }
  return { position: point, valid };
}
/**
 * A joint projection's TSL mapping for options `o`: `{xy, lambda}`, xy a vec4 (x, y, 1 on the map,
 * albers-usa's inset) and lambda the longitude relative to the center (unwrapped with `unwrap`).
 */
export function jointNodes(o, lon, lat, f, origin, { unwrap = false, near = null } = {}) {
  const projection = o.get("projection");
  const center = reference("_projectionCenterLongitude", "float", o.transformed).sub(origin).mul(f);
  const relative = lon.sub(center);
  // `near`: wrap by that longitude's extent instead of the point's own (a path piece's middle).
  const lambda = unwrap ? relative : near
    ? relative.sub(near.sub(center).add(PI).div(2 * PI).floor().mul(2 * PI))
    : mod(relative.add(PI), 2 * PI).sub(PI);
  const conic = projection === "albers" ? (() => {
    const parallels = reference("parallels", "vec2", o.transformed);
    return conicNodes(parallels.x.mul(f), parallels.y.mul(f),
      reference("_projectionCenterLatitude", "float", o.transformed).mul(f));
  })() : null;
  return { xy: jointNode(projection, lambda, lat, { conic, absolute: lon }), lambda };
}
export function pathPointNode(mark, a, b, t) {
  const o = mark.options,
    f = angularFactor(o), originValue = longitudeOrigin(o),
    kind = interpolationOf(mark);
  if (kind === "angular") return mix(a, b, t);
  const u = directionNode(a, f, originValue),
    v = directionNode(b, f, originValue),
    d = u.dot(v).clamp(-1, 1),
    angle = acos(d),
    raw = v.sub(u.mul(d));
  const axis = u.y
    .abs()
    .lessThan(0.9)
    .select(vec3(0, 1, 0), vec3(1, 0, 0));
  const fallback = axis.sub(u.mul(axis.dot(u))).normalize();
  const tangent = raw
    .length()
    .lessThan(1e-6)
    .select(fallback, raw.div(raw.length().max(1e-20)));
  const direction = d
    .greaterThan(0.999999)
    .select(
      mix(u, v, t).normalize(),
      u.mul(angle.mul(t).cos()).add(tangent.mul(angle.mul(t).sin())),
    );
  let lon = atan(direction.x, direction.z);
  const origin = a.x.sub(originValue).mul(f);
  lon = origin.add(mod(lon.sub(origin).add(PI), 2 * PI).sub(PI));
  return vec3(
    lon.div(f).add(originValue),
    asin(direction.y.clamp(-1, 1)).div(f),
    mix(a.z, b.z, t),
  );
}

export function curvePointNode(mark,a,b,t){
 const curve=mark.options.get('curve');
 if(curve?.startsWith('step')){
  const edge=curve==='step-before'?0:curve==='step-after'?1:.5;
  if(edge===0)return t.lessThan(.5).select(vec3(a.x,mix(a.y,b.y,t.mul(2)),a.z),vec3(mix(a.x,b.x,t.sub(.5).mul(2)),b.y,a.z));
  if(edge===1)return t.lessThan(.5).select(vec3(mix(a.x,b.x,t.mul(2)),a.y,a.z),vec3(b.x,mix(a.y,b.y,t.sub(.5).mul(2)),a.z));
  const x=mix(a.x,b.x,.5);
  return t.lessThan(1/3).select(vec3(mix(a.x,x,t.mul(3)),a.y,a.z),t.lessThan(2/3).select(vec3(x,mix(a.y,b.y,t.mul(3).sub(1)),a.z),vec3(mix(x,b.x,t.mul(3).sub(2)),b.y,a.z)));
 }
 const u=float(1).sub(t),c=mark.control1Node??a,d=mark.control2Node??b;
 return a.mul(u.pow(3)).add(c.mul(u.pow(2).mul(t).mul(3))).add(d.mul(u.mul(t.pow(2)).mul(3))).add(b.mul(t.pow(3)));
}

/** The signed facing of a source point on the mark's own centered
 * orthographic projection (positive in front, zero on the horizon), or null
 * where that projection does not apply. */
/** @param {{options: import("./frameNodes.js").ShaderOptions}} mark
 * @param {import("three/webgpu").Node<"vec3">} p
 * @param {import("./frameNodes.js").ShaderOptions} [o]
 * @returns {import("three/webgpu").Node<"float"> | null} */
export function orthographicFacing(mark, p, o = mark.options) {
  if (!spherical(o) || o.get("projection") !== "orthographic" || coordinateView(o) === "chart" ||
      coordinateView(o) === "3d" && o.get("sphericalView") !== "projected") return null;
  const f = angularFactor(o), origin = longitudeOrigin(o);
  return directionNode(p, f, origin).dot(centeredOrthographicBasis(o, f, origin).outward);
}

export function hemisphereOpacity(mark){
 const o=mark.options;
 if(!spherical(o)||o.get('projection')!=='orthographic'||coordinateView(o)==='chart'||coordinateView(o)==='3d'&&o.get('sphericalView')!=='projected')return float(1);
 let p=mark.coordinatesNode;
 if(!p&&mark.startNode){const t=mark.curvedPaths?mix(mark.curvedPaths.meta.y,mark.curvedPaths.meta.z,uv().y.clamp(0,1)):uv().y.clamp(0,1);p=(o.get('curve')??'linear')==='linear'?pathPointNode(mark,mark.startNode,mark.endNode,t):curvePointNode(mark,mark.startNode,mark.endNode,t);}
 if(!p&&mark.valueNode?.sample)p=vec3(0,uv().y.mul(mark.yboundsNode.y.sub(mark.yboundsNode.x)).add(mark.yboundsNode.x),0);
 if(!p)return float(1);
 const f=angularFactor(o),origin=longitudeOrigin(o),basis=centeredOrthographicBasis(o,f,origin);
 return directionNode(p,f,origin).dot(basis.outward).greaterThanEqual(-1e-7).select(1,0);
}
