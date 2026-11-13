import { capability } from "./markKinds.js";
export const MAPPING_CONTEXT = Symbol('mark mappings');
const common = new Set('opacity visible animation animationDuration animationEasing color colorScale fill fillScale outlineColor outlineWidth outlineOpacity width widthScale size sizeScale rotation select hover brush respond selectionOpacity enter exit'.split(' '));
const positions = new Set('position x y z previous'.split(' '));
const paths = new Set('start end control1 control2 curve curveAlpha headLength headWidth dashed dashSize gapSize'.split(' '));
const excluded = new Set('children name label options target surface legend'.split(' '));
/** @param {string} kind @param {Record<string, unknown>[]} scopes @param {Record<string, unknown>} explicit
 * @returns {{values: import("./markPlanTypes.js").AuthoredChannels, provenance: import("./markPlanTypes.js").NamedChannelProvenance, ignored: {property: string, source: string, reason: string}[]}} */
export function resolveMappings(kind, scopes, explicit) {
  const allowed = new Set(common);
  // Paths (markKinds.js curves: Line, Segments, Arrows3D, Arrows) take color, not fill, and no
  // point size, outline or rotation; their ends and curve take the path channels.
  const path = capability(kind, 'curves');
  if(kind==='Text'||path)for(const k of ['fill','fillScale'])allowed.delete(k);
  if(path)for(const k of ['size','outlineColor','outlineWidth','rotation'])allowed.delete(k);
  // A raster (Heatmap, Image, Surface) is placed by its bounds, not by rows' positions.
  if (capability(kind, 'rows') !== false) for (const k of positions) allowed.add(k);
  if (path) for (const k of paths) allowed.add(k);
  if (capability(kind, 'caps')) allowed.add('capSize');
  if (capability(kind, 'series')) allowed.add('series');
  if (['Points','Text'].includes(kind)) for (const k of ['dx','dy','shape','shapeScale','align','text','font',...(kind==='Text'?['box','leader']:[])]) allowed.add(k);
  // Anchor draws nothing: only positions and animation timing apply to it.
  if (kind === 'Anchor') for (const k of [...allowed]) if (!positions.has(k) && !['animation','animationDuration','animationEasing','enter','exit'].includes(k)) allowed.delete(k);
  if (['Rect','Prism','Area','ErrorBars'].includes(kind)) for (const k of 'x0 x1 y0 y1 z0 z1 lower upper baseline depth capSize'.split(' ')) allowed.add(k);
  const band = kind === 'Area';
  if (band) allowed.delete('baseline');
  if (!capability(kind, "outlines"))
    for (const key of ["outlineColor", "outlineWidth", "outlineOpacity"]) allowed.delete(key);
  /** @type {Record<string, unknown>} */
  const result = {};
  /** @type {import("./markPlanTypes.js").NamedChannelProvenance} */
  const provenance = {};
  const ignored = [];
  for (const [index, layer] of [...scopes, explicit].entries()) {
    const source = layer?.__mappingSource ?? (index === scopes.length ? { kind: 'explicit', label: kind } : { kind: 'mapping', label: 'Mapping' });
    let entries = Object.entries(layer).filter(([,v])=>v!==undefined);
    // A Area's positions run along one axis (bandMarkValues): a horizontal one reads a
    // Mapping's y as its positions (its mark's x); a vertical one has no y.
    if (band && layer !== explicit) entries = entries.flatMap(([k, v]) => {
      const horizontal = explicit?.axis === 'x';
      if (k === (horizontal ? 'x' : 'y')) {
        ignored.push({property:k,source:source.label,reason:`A ${horizontal ? 'horizontal' : 'vertical'} Area's ${k} is lower and upper.`});
        return [];
      }
      return [[horizontal && k === 'y' ? 'x' : k, v]];
    });
    if (entries.some(([k])=>k==='position')) for (const k of ['x','y','z']) delete result[k];
    if (entries.some(([k])=>['x','y','z'].includes(k))) delete result.position;
    for (const [key,value] of entries) {
      if (key === '__mappingSource') continue;
      if (layer===explicit || allowed.has(key)&&!excluded.has(key)&&!key.startsWith('on')) {
        result[key]=value;
        provenance[key]=source;
      } else if (source.kind === 'mapping' && !excluded.has(key) && !key.startsWith('on'))
        ignored.push({property:key,source:source.label,reason:`${kind} does not support this channel.`});
    }
  }
  return {values:result,provenance,ignored};
}
export function mergeMappings(kind, scopes, explicit) {
  return resolveMappings(kind, scopes, explicit).values;
}
