import { Array as JaxArray } from "@hmplot/jax";
import { asArray } from "./data.js";

/** Data-owned, lazy dictionary encoding. Returned columns are borrowed. */
export function createColumnEncoding() {
  const entries = new Map();
  const unchanged = (entry, source) => entry.contents.length === source.length &&
    entry.contents.every((value, i) => Object.is(value, source[i]));
  const capture = (input, metadata, mutable = false, hostSource) => {
    if (!input?.categories && !["categorical", "ordinal", "boolean"].includes(metadata?.type)) return null;
    const deviceCodes = input?.codes instanceof JaxArray;
    const source = deviceCodes ? hostSource : input?.codes ?? input;
    const categories = input?.categories ?? metadata?.domain;
    if ((!Array.isArray(source) && !ArrayBuffer.isView(source)) || !Array.isArray(categories)) return null;
    const signature = JSON.stringify([metadata?.type, categories]);
    let entry = entries.get(input);
    if (entry?.signature === signature && (!mutable || deviceCodes || unchanged(entry, source))) return entry;
    entry?.value?.codes.dispose();
    entry = { signature, deviceCodes, contents: source.slice(), categories: categories.slice(),
      dictionary: Boolean(input?.categories), metadata: input?.metadata };
    entries.set(input, entry);
    return entry;
  };
  const host = entry => entry.host ??= {
    // Already encoded host inputs preserve their codes and order. Ordinary strings
    // acquire a dictionary only on the first encoded/host-code read.
    codes: entry.dictionary ? entry.contents : (() => {
      const lookup = new Map(entry.categories.map((value, code) => [value, code]));
      return Int32Array.from(entry.contents, value => lookup.get(value) ?? -1);
    })(),
    categories: entry.categories,
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
  };
  return {
    get(input, metadata, mutable = false) {
      if (input?.codes instanceof JaxArray) return input;
      const entry = capture(input, metadata, mutable);
      return entry ? (entry.value ??= { ...host(entry), codes: asArray(host(entry).codes) }) : input;
    },
    host(input, metadata) { const entry = capture(input, metadata); return entry && host(entry); },
    reader(input, metadata, hostSource) {
      const entry = capture(input, metadata, false, hostSource);
      return () => entry ? host(entry) : undefined;
    },
    prune(inputs) {
      for (const [input, entry] of entries) if (!inputs.has(input) || !entry.deviceCodes && !unchanged(entry, input?.codes ?? input)) {
        entry.value?.codes.dispose(); entries.delete(input);
      }
    },
    dispose() {
      for (const entry of entries.values()) entry.value?.codes.dispose();
      entries.clear();
    },
  };
}
