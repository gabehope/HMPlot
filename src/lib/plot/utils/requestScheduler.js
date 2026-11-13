// Request slots for tile loads (TODO 35), after loaders.gl's RequestScheduler (MIT). Stage 35.0
// measured it and did not install it: @loaders.gl/loader-utils brings 17 packages for these
// few lines.

/**
 * At most `maxRequests` requests run at once. New requests wait until `debounceTime` ms pass
 * with no newer one (a moving camera does not start requests it will not need), and at most
 * `maxWait` ms after the first of them (TODO 63.7: a camera asking for new tiles every frame put
 * every request off while it moved); then waiting requests start in priority order. `priority()` is read again whenever slots open: lower starts
 * first, and a negative value (or NaN) cancels. schedule() resolves to { done } when the request
 * may start (call done() when it ends, however it ends), or to null when it was canceled.
 * Requests whose priority is at least `speculative` (TODO 66: tiles loaded ahead of a flyover,
 * not on screen) hold at most `maxSpeculative` slots, so the rest stay free for the tiles a view
 * shows when they come.
 * @param {{ maxRequests?: number, debounceTime?: number, maxWait?: number, speculative?: number, maxSpeculative?: number }} [options]
 */
export function createRequestScheduler({ maxRequests = 6, debounceTime = 0, maxWait = Infinity, speculative = Infinity, maxSpeculative = Infinity } = {}) {
  let waiting = [], active = 0, guessing = 0, timer = null, disposed = false, since = null;
  function issue() {
    timer = null;
    since = null;
    const kept = [];
    for (const request of waiting) {
      let value;
      try { value = request.priority(); } catch { value = -1; }
      if (value >= 0) kept.push({ request, value });
      else request.resolve(null);
    }
    kept.sort((a, b) => a.value - b.value);
    waiting = kept.map(({ request }) => request);
    // Lowest first: past the first speculative request, the rest are speculative too.
    while (active < maxRequests && waiting.length) {
      const guess = kept[kept.length - waiting.length].value >= speculative;
      if (guess && guessing >= maxSpeculative) break;
      const request = waiting.shift();
      let finished = false;
      active++;
      if (guess) guessing++;
      request.resolve({
        done() {
          if (finished) return;
          finished = true;
          active--;
          if (guess) guessing--;
          // A finished request frees a slot at once: the debounce only holds new requests.
          if (waiting.length && timer === null && !disposed) queueMicrotask(() => { if (timer === null && !disposed) issue(); });
        },
      });
    }
  }
  return {
    /** @param {() => number} [priority] @returns {Promise<{ done: () => void } | null>} */
    schedule(priority = () => 0) {
      if (disposed) return Promise.resolve(null);
      return new Promise((resolve) => {
        waiting.push({ priority, resolve });
        if (timer !== null) clearTimeout(timer);
        const now = performance.now();
        since ??= now;
        timer = setTimeout(issue, Math.max(0, Math.min(debounceTime, since + maxWait - now)));
      });
    },
    /** Read every waiting request's priority now (a canceled one resolves to null). */
    update() {
      if (disposed || timer !== null) return;
      issue();
    },
    get active() { return active; },
    get waiting() { return waiting.length; },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      for (const request of waiting) request.resolve(null);
      waiting = [];
    },
  };
}
