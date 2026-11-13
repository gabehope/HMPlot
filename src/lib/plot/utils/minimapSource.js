// Opaque public handles keep renderer, scene, and GPU objects library-private.
import { displayMultiplier, instanceLimit } from "./sampling.js";
const sources = new WeakMap();
let nextSource = 0;
export const minimapSource = (handle) => handle && sources.get(handle);
export function createMinimapSource(onactive) {
  const handle = Object.freeze({});
  const clients = new Set();
  let backend, disposed=false;
  const id=++nextSource;
  const source = {
    handle,
    id,
    clients,
    connect(canvas, notify) {
      if(disposed) throw Error('Overview source is disposed.');
      const client = { canvas, notify, width: 1, height: 1, revision: -1, sourceId:id };
      clients.add(client);
      onactive(clients.size);
      backend?.invalidate();
      return {
        configure(displayScale, maxInstances, axes = false, axis = undefined) {
          client.displayScale = displayMultiplier(displayScale);
          instanceLimit(maxInstances);
          client.maxInstances = maxInstances;
          client.axes = axes;
          client.axis = axis;
          client.revision = -1;
          backend?.invalidate();
        },
        resize(width, height) {
          client.width = width;
          client.height = height;
          client.revision = -1;
          backend?.invalidate();
        },
        exportPNG: (scale) => backend?.exportPNG(client, scale),
        move: (x, y, start) => backend?.move(x, y, start),
        align: (axis, sign) => backend?.align(axis, sign),
        orbit: (dx, dy, start) => backend?.orbit(dx, dy, start),
        capture: () => backend?.capture(),
        restore: (state) => backend?.restore(state),
        dispose() {
          if (!clients.delete(client)) return;
          backend?.release(client);
          notify(null);
          onactive(clients.size);
        },
      };
    },
    bind(next) {
      if(disposed)return()=>{};
      if(backend && backend!==next)for(const c of clients)backend.release(c);
      backend = next;
      next.invalidate();
      return () => {
        if(backend!==next)return;
        for (const c of clients) {
          next.release(c);
          c.notify(null);
        }
        if (backend === next) backend = undefined;
      };
    },
    dispose() {
      disposed=true;
      for (const c of clients) {
        backend?.release(c);
        c.notify(null);
      }
      clients.clear();
      onactive(0);
      backend = undefined;
      sources.delete(handle);
    },
  };
  sources.set(handle, source);
  return source;
}
