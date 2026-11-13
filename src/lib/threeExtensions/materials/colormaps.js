import * as THREE from "three/webgpu";
import {
  COLORMAP_NAMES,
  COLORMAP_SAMPLES,
  colormapKey,
  normalizeColormap,
  sampleColormap,
} from "../../plot/utils/colormap.js";
import { limitError } from "../../plot/utils/limits.js";

const COLOR_SCALE_NAMES = [...COLORMAP_NAMES];
const COLOR_SCALE_MAP = Object.fromEntries(
  COLOR_SCALE_NAMES.map((n, i) => [n, i])
);

// One texture row per colormap. The capacity is fixed so materials never rebind when a
// custom map is registered: built-ins fill the first rows and custom maps the rest,
// recycling rows that no mark has drawn recently.
const SAMPLES = COLORMAP_SAMPLES;
const COLORMAP_ROWS = 256;
// Samples are sRGB; the texture holds linear values, as THREE.Color would produce.
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function linearSamples(spec) {
  const samples = sampleColormap(spec, SAMPLES);
  for (let i = 0; i < samples.length; i++) if (i % 4 !== 3) samples[i] = toLinear(samples[i]);
  return samples;
}
const data = new Float32Array(SAMPLES * COLORMAP_ROWS * 4);
COLOR_SCALE_NAMES.forEach((name, row) => data.set(linearSamples(name), row * SAMPLES * 4));

const colormapTexture = new THREE.DataTexture(
  data,
  SAMPLES,
  COLORMAP_ROWS,
  THREE.RGBAFormat,
  THREE.FloatType,
);
colormapTexture.wrapS = THREE.ClampToEdgeWrapping;
colormapTexture.wrapT = THREE.ClampToEdgeWrapping;
colormapTexture.magFilter = THREE.NearestFilter;
colormapTexture.minFilter = THREE.NearestFilter;
colormapTexture.colorSpace = THREE.LinearSRGBColorSpace;
colormapTexture.needsUpdate = true;

const rows = new Map(COLOR_SCALE_NAMES.map((name, row) => [name, row]));
const specs = COLOR_SCALE_NAMES.map((name) => name);
const keys = COLOR_SCALE_NAMES.map((name) => name);
const BUILTIN_ROWS = COLOR_SCALE_NAMES.length;
const CUSTOM_ROWS = COLORMAP_ROWS - BUILTIN_ROWS;

// Custom rows are recycled least-recently-used first. Every mark resolves its colormap row
// each time it renders (the cmapIndex uniform reads the option through this function), so a
// map that is on screen keeps a fresh stamp, and a recycled map simply re-registers the next
// time its mark renders. Rows used within RECENT_MS may belong to the frame being drawn and
// are never recycled; running out of those is the overflow error.
const RECENT_MS = 1000;
const lastUse = new Float64Array(COLORMAP_ROWS).fill(-Infinity);
let clock = () => globalThis.performance?.now?.() ?? Date.now();
const overflowListeners = new Set(), overflowed = new Set();

function recyclableRow(now) {
  let row = -1;
  for (let index = BUILTIN_ROWS; index < COLORMAP_ROWS; index++)
    if (row < 0 || lastUse[index] < lastUse[row]) row = index;
  return row >= 0 && lastUse[row] <= now - RECENT_MS ? row : -1;
}

/**
 * The texture row for a colormap name or custom spec, registering custom maps on first
 * use. The same spec returns the same row while it stays registered; a custom map unused
 * for a while may give its row to a new one (and re-registers when used again).
 */
function registerColormap(spec) {
  const key = colormapKey(spec), now = clock();
  let row = rows.get(key);
  if (row !== undefined) {
    lastUse[row] = now;
    return row;
  }
  const normalized = normalizeColormap(spec);
  row = specs.length < COLORMAP_ROWS ? specs.length : recyclableRow(now);
  if (row < 0) {
    const error = limitError("colormaps", {
      count: CUSTOM_ROWS + 1,
      limit: CUSTOM_ROWS,
    });
    overflowed.add(key);
    for (const listener of overflowListeners) listener(key, error.message);
    throw error;
  }
  if (keys[row] !== undefined) rows.delete(keys[row]);
  data.set(linearSamples(normalized), row * SAMPLES * 4);
  colormapTexture.needsUpdate = true;
  rows.set(key, row);
  specs[row] = normalized;
  keys[row] = key;
  lastUse[row] = now;
  if (overflowed.delete(key)) for (const listener of overflowListeners) listener(key, "");
  return row;
}

/** The normalized spec stored in a texture row (a name for built-ins). */
function colormapAt(row) {
  return specs[row] ?? "Viridis";
}

/**
 * Listen for colormaps that found no free row: listener(key, message), and listener(key, "")
 * once that map registers again. Returns the unsubscribe function.
 */
function onColormapOverflow(listener) {
  overflowListeners.add(listener);
  return () => overflowListeners.delete(listener);
}

/** Tests: replace the millisecond clock that ages custom rows; returns the previous one. */
function setColormapClock(next) {
  const previous = clock;
  clock = next;
  return previous;
}

export {
  COLOR_SCALE_NAMES,
  COLOR_SCALE_MAP,
  COLORMAP_ROWS,
  colormapTexture,
  registerColormap,
  colormapAt,
  onColormapOverflow,
  setColormapClock,
};
