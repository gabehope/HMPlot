import { geoFeatures } from "./geoData.js";

// Owned by one GeoJSON mark. Keep the worker and its source between seam changes.
// Cancellation terminates an in-flight job; the next request starts a fresh worker.
export function createGeoGeometryWorker() {
  let worker, source, geometries, pending, disposed = false;
  const stop = () => {
    worker?.terminate();
    worker = source = geometries = undefined;
  };
  return {
    prepare(input, options, signal) {
      if (disposed || signal?.aborted)
        return Promise.reject(new DOMException("Canceled", "AbortError"));
      pending?.cancel();
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          signal?.removeEventListener("abort", cancel);
          pending = undefined;
        };
        const cancel = () => {
          stop();
          cleanup();
          reject(new DOMException("Canceled", "AbortError"));
        };
        pending = { cancel };
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          worker ??= new Worker(new URL("../workers/geoGeometry.worker.js", import.meta.url), { type: "module" });
          worker.onmessage = ({ data }) => {
            cleanup();
            data.error ? reject(Error(data.error)) : resolve(data.result);
          };
          worker.onerror = (e) => {
            stop();
            cleanup();
            reject(Error(e.message || "GeoJSON geometry worker failed."));
          };
          const message = { options };
          const features = geoFeatures(input), nextGeometries = features.map((f) => f.geometry);
          if (source !== input || geometries?.length !== nextGeometries.length || nextGeometries.some((g, i) => g !== geometries[i])) {
            // Svelte proxies and feature properties cannot be structured-cloned. Send only
            // the geometry and per-feature clipping boxes needed by preprocessing.
            const clone = (x) => Array.isArray(x) ? x.map(clone) : x;
            const copy = (g) => g === null ? null : {
              type: g.type,
              ...(g.type === "GeometryCollection" ? { geometries: g.geometries.map(copy) } : { coordinates: clone(g.coordinates) }),
            };
            message.input = { type: "FeatureCollection", features: features.map((f) => ({
              type: "Feature", id: f.id, properties: {}, geometry: copy(f.geometry),
              ...(f.tileClip ? { tileClip: clone(f.tileClip) } : {}),
            })) };
          }
          worker.postMessage(message);
          source = input;
          geometries = nextGeometries;
        } catch (e) {
          stop();
          cleanup();
          reject(e);
        }
      });
    },
    dispose() {
      disposed = true;
      pending?.cancel();
      stop();
    },
  };
}
