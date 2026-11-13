import { numpy as np, random } from "@hmplot/jax";
import { asArray } from "./data.js";
import { shapeChannelProps } from "./namedData.js";
import { placeGlyphs } from "./dodgePlacement.js";

/** Place glyphs in a worker (off the main thread), or here where there are no workers (Node). */
function placeOffThread(input, signal) {
  if (typeof Worker === "undefined")
    return Promise.resolve(placeGlyphs(input.x, input.radius, input.group, input.order, input.padding));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/dodgePlacement.worker.js", import.meta.url), { type: "module" });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException("Canceled", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) => {
      cleanup();
      data.error ? reject(Error(data.error)) : resolve(data.offsets);
    };
    worker.onerror = (e) => {
      cleanup();
      reject(Error(e.message || "Dodge placement worker failed."));
    };
    worker.postMessage(input, [input.x.buffer, input.radius.buffer, input.group.buffer, input.order.buffer]);
  });
}

/**
 * Each glyph's offset from the baseline: in a seeded order, the offset nearest the baseline that
 * clears every earlier glyph of its group (TODO 30.10). The positions, radii, groups and the
 * seeded order are read back once and placed on the host (dodgePlacement.js), in a worker;
 * before, each glyph was a GPU pass with a wait per 128 earlier glyphs.
 */
export async function dodgeOffsets(
  position,
  radius,
  { groups = undefined, padding = 1, seed = 42, signal = undefined } = {},
) {
  const n = position.shape[0];
  if (!Number.isFinite(padding) || padding < 0)
    throw Error("Dodge padding must be finite and nonnegative.");
  if (!n) return np.zeros([0]);
  const order = np.argsort(random.uniform(random.key(seed), [n])).astype(np.float32);
  const x = np.where(np.isfinite(position.ref), position.ref, 1e15);
  const r = np.where(np.isfinite(radius.ref), np.maximum(radius.ref, 0), 0);
  const g = groups ? groups.ref.astype(np.float32) : np.zeros([n]);
  const host = Float32Array.from(await np.stack([x, r, g, order]).data());
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  const offsets = await placeOffThread({
    x: host.slice(0, n), radius: host.slice(n, 2 * n), group: host.slice(2 * n, 3 * n),
    order: Int32Array.from(host.subarray(3 * n, 4 * n)), padding,
  }, signal);
  return np.array(offsets, { dtype: np.float32 });
}

export async function prepareDodge(
  props,
  scope,
  options,
  camera,
  renderer,
  config,
  signal,
) {
  const { numericColumn, categoryColumn } = await import("./dataView.js");
  const { transformArray } = await import("./data.js");
  if (
    !camera?.isOrthographicCamera ||
    (options.get("coordinates") ?? "cartesian") !== "cartesian"
  )
    throw Error("Dodge requires a Cartesian 2D plot.");
  const axis = config.axis === "y" ? "x" : "y",
    index = axis === "x" ? 0 : 5,
    span =
      axis === "x"
        ? renderer.domElement.clientWidth
        : renderer.domElement.clientHeight;
  const get = (key) => options.get(key) ?? props[key];
  // A shape channel (a column or per-row names) spaces glyphs by
  // their bounding square; only a literal circle packs by its disc.
  const channelProps = shapeChannelProps(props, scope, "Points"),
    shapeChannel = channelProps.shapeField !== undefined;
  // Without a size (no theme supplies one), Points' default diameter, 6 CSS pixels (TODO 73.1).
  const coord = numericColumn(scope, config.field),
    size =
      typeof (props.size ?? 6) === "number"
        ? np.full([scope.length], props.size ?? 6)
        : asArray(scope.resolve(props.size));
  const positions = transformArray(
    coord,
    get(axis + "Transform") ?? "linear",
    get(axis + "bounds") ?? [-1, 1],
    get(axis + "range") ?? [-50, 50],
    get(axis + "TransformConstant") ?? 1,
  ).mul((Math.abs(camera.projectionMatrix.elements[index]) * span) / 2);
  const radii = transformArray(
    size,
    get("scaleTransform") ?? "linear",
    get("scaleBounds") ?? [0, 1],
    get("scaleRange") ?? [0, 1],
    get(`scaleTransformConstant`) ?? 1,
  ).mul(
    (get("displayScale") ?? 1) *
      0.5 *
      (!shapeChannel && (options.get("shape") ?? channelProps.shape ?? "circle") === "circle"
        ? 1
        : Math.SQRT2),
  );
  let groups;
  if (config.by !== undefined) {
    const value = scope.resolve(config.by);
    if (categoryColumn(value)) {
      if (value.codes) groups = asArray(value.codes);
      else {
        const lookup = new Map([...new Set(value)].map((v, i) => [v, i]));
        groups = np.array(value.map(v => lookup.get(v)), { dtype: np.int32 });
      }
    } else if (typeof value !== "number") groups = asArray(value);
  }
  try {
    return await dodgeOffsets(positions, radii, { ...config, groups, signal });
  } finally {
    groups?.dispose();
    positions.dispose();
    radii.dispose();
  }
}
