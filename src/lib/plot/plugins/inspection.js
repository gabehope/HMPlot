import { Array as JaxArray } from "@hmplot/jax";
import { dataBufferLimit } from "../utils/dataView.js";

/** Adopt auxiliary buffers before validating a plugin result. These are not output columns:
 * their shape is independent of row count and they remain on the device until inspect() asks
 * for a summary. The publication owns one reference per property, just like output columns.
 */
export function pluginInspection(
  kind,
  definition,
  params,
  resources,
  { own, maxBytes = dataBufferLimit() },
) {
  for (const value of Object.values(resources ?? {}))
    if (value instanceof JaxArray) own(value);
  if (
    resources !== undefined &&
    (!resources || typeof resources !== "object" || Array.isArray(resources))
  )
    throw Error(`${kind}: resources must be an object of auxiliary arrays.`);
  for (const [name, value] of Object.entries(resources ?? {})) {
    if (!(value instanceof JaxArray) && !ArrayBuffer.isView(value))
      throw Error(`${kind}: resource "${name}" must be an array.`);
    const bytes =
      value instanceof JaxArray
        ? value.shape.reduce((size, dimension) => size * dimension, 4)
        : value.byteLength;
    if (bytes > maxBytes)
      throw Error(
        `${kind}: resource "${name}" exceeds the GPU storage-buffer limit.`,
      );
  }
  if (!definition.inspect) return undefined;
  return async () => {
    // An inspect already in flight survives replacement/disposal of its publication. Borrowed
    // arrays still require .ref when consumed by a kernel or readback in the plugin callback.
    const borrowed = new Set();
    const collect = (value) => {
      if (value instanceof JaxArray) borrowed.add(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && Object.getPrototypeOf(value) === Object.prototype)
        Object.values(value).forEach(collect);
    };
    collect(resources ?? {});
    // Field parameters can be device arrays aligned by the runner. Retain these too if an
    // inspector reads its effective parameters after the publication has been replaced.
    collect(params);
    const retained = [...borrowed].map((value) => value.ref);
    try {
      return await definition.inspect({ params, resources: resources ?? {} });
    } finally {
      retained.forEach((value) => value.dispose());
    }
  };
}
