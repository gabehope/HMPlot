import { interleaveAttributes } from "three/addons/utils/BufferGeometryUtils.js";
import { limitError } from "./limits.js";

/** WebGPU's default (and most common) maxVertexBuffers limit. */
export const DEFAULT_MAX_VERTEX_BUFFERS = 8;

// User-facing names for the per-row fields a mark binds as vertex buffers.
const CHANNEL_NAMES = {
  position: "position",
  size: "size",
  fill: "fill values",
  symbolCode: "shape",
  categoryColor: "per-row colors",
  categoryOutline: "per-row outline colors",
  dx: "dx",
  dy: "dy",
  textCode: "text",
  textWidth: "text widths",
  color: "color values",
  width: "width",
  endpointOffset: "endpoint pixel offsets (from Dodge)",
  interactionOpacity: "per-row opacity (RGBA alpha, an opacity array or column, or selection feedback)",
};

/**
 * The render error for a mark whose per-row fields need more vertex buffers than the device
 * allows, or "" when they fit. WebGPU binds each per-row field as its own vertex buffer beside
 * the geometry's attributes and the instance matrix (`fixed`), and a pipeline over the limit
 * is invalid: the mark would draw nothing.
 * @param {string} markName component name, e.g. "Text"
 * @param {number} fixed vertex buffers the geometry and instance matrix take
 * @param {string[]} perRow field names bound per row
 * @param {number} [limit] the device's maxVertexBuffers
 */
export function vertexBufferIssue(markName, fixed, perRow, limit = DEFAULT_MAX_VERTEX_BUFFERS) {
  const needed = fixed + perRow.length;
  if (needed <= limit) return "";
  const room = Math.max(0, limit - fixed), extra = needed - limit;
  const names = perRow.map((name) => CHANNEL_NAMES[name] ?? name);
  return limitError("vertexBuffers", { component: markName, what: `drawing ${perRow.length} per-row channels (${names.join(", ")})`, count: needed, limit,
    hint: `This mark has room for ${room}: give ${extra === 1 ? "one of them" : `${extra} of them`} a single value instead of one per row.` }).message;
}

/**
 * The vertex buffers a geometry's attributes take: attributes interleaved into one buffer
 * bind it once.
 * @param {import("three/webgpu").BufferGeometry | undefined} geometry
 */
export function geometryVertexBuffers(geometry) {
  const attributes = Object.values(geometry?.attributes ?? {});
  return new Set(attributes.map((attribute) => attribute.isInterleavedBufferAttribute ? attribute.data : attribute)).size;
}

/**
 * The per-row fields a Line, Segments, Arrows or Arrows build binds as vertex buffers
 * when they hold one value per row. `positions` are bound on every draw (start and end; a
 * Line's neighbors), so they count as fixed room; `channels` are the appearance channels a
 * render error names. A curved mark reads every row from storage buffers instead, and binds
 * none; a dashed Line's path distances are a storage read too (utils/dashDistances.js).
 * @param {Partial<Record<"curved" | "connected" | "categoryColor" | "endpointOffset", boolean>>} state
 *   `connected` for a Line, `categoryColor` when colors are per-row RGB, `endpointOffset` when an
 *   endpoint carries pixel offsets (Dodge)
 * @returns {{ positions: string[], channels: string[] }}
 */
export function segmentVertexBufferFields({ curved = false, connected = false, categoryColor = false, endpointOffset = false } = {}) {
  if (curved) return { positions: [], channels: [] };
  return {
    positions: ["start", "end", ...(connected ? ["previous", "next"] : [])],
    channels: [categoryColor ? "categoryColor" : "color", "width", ...(endpointOffset ? ["endpointOffset"] : []), "interactionOpacity"],
  };
}

/**
 * Interleave every attribute of `geometry` into one buffer, in place, and return it. WebGPU
 * counts buffers, not attributes, against its vertex buffer limit, so a mark's template mesh
 * (position, uv, ...) then takes one slot and leaves the others to per-row channels.
 * @template {import("three/webgpu").BufferGeometry} G
 * @param {G} geometry
 * @returns {G}
 */
export function interleaveGeometry(geometry) {
  const names = Object.keys(geometry.attributes);
  const attributes = interleaveAttributes(names.map((name) => geometry.attributes[name]));
  names.forEach((name, index) => geometry.setAttribute(name, attributes[index]));
  return geometry;
}
