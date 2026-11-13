// The browser suite's `test` (every spec imports it from here, not from @playwright/test): a
// page load that stalls is loaded once more, loudly (TODO 136.1b).
//
// The gate went red on navigations that never finished: page.goto never reached "load", or the
// page loaded and its module never ran, while the tests beside it passed and the test passed
// alone. A document, script or stylesheet of a page that has had no response for `stallTimeout`
// (a page's modules load in 3-4 s on a cold dev server, 7 s at worst under four workers) is a
// stall: the test is annotated `stalled-load` with the requests still open and how long each
// waited, the warning goes to the test's output, and the page is loaded again, once per navigation.
// Only a load is retried: during page.goto, or for a request that started within `loadWindow`
// of its return (the route's modules, imported after "load"); a later stall is annotated only,
// since reloading would discard what the test has done. A second stall is annotated and not
// retried: the test times out as before, and the annotations say whether the reload's requests
// stalled as well (a stuck server transform) or loaded (a lost response or connection).
// An entirely empty CSR mount after the same deadline also qualifies, even when all assets
// answered. A JavaScript error prevents this bootstrap recovery; mounted UI is never reloaded.
// scripts/gate.mjs lists every stalled load, passed tests' too, with the dev server's slow
// requests. Pages of the test's own context are watched, not those of a browser.newContext().
import { test as base, expect } from "@playwright/test";

export { expect };

const watched = new Set(["document", "script", "stylesheet"]);
const loadWindow = 10000;

export const test = base.extend({
  stallTimeout: [30000, { option: true }],
  context: async ({ context, stallTimeout }, use, testInfo) => {
    const timers = new Set();
    const watch = (page) => {
      // Open requests, by when they started.
      const open = new Map();
      let retried = false, navigation = null, loaded = -Infinity, bootstrapChecked = false, initializationError = false;
      page.on("pageerror", () => { initializationError = true; });
      const mainFrame = (request) => {
        try {
          return request.frame() === page.mainFrame();
        } catch {
          return false; // a service worker's, or a navigation's whose frame is gone
        }
      };
      page.on("request", (request) => {
        if (watched.has(request.resourceType()) && mainFrame(request)) open.set(request, Date.now());
      });
      for (const event of ["requestfinished", "requestfailed"]) page.on(event, (request) => open.delete(request));
      const stalled = (requests, bootstrap = false) => {
        const now = Date.now(), loading = bootstrap || !!navigation || requests.some(([, start]) => start - loaded < loadWindow);
        const list = bootstrap ? [`GET ${page.url()} (blank bootstrap, ${Math.round((now - loaded) / 1000)} s)`] : requests.map(([r, start]) => `${r.method()} ${r.url()} (${r.resourceType()}, ${Math.round((now - start) / 1000)} s)`);
        const note = retried ? " (after a reload; not retried)" : loading ? "" : " (after the page loaded; not retried)";
        testInfo.annotations.push({ type: "stalled-load", description: `${list.join("; ")}${note}` });
        console.warn(`Stalled page load (TODO 136.1b): ${list.join("; ")}${note}`);
        if (retried || !loading) return;
        retried = true;
        // The first load's other requests end when the new one commits: not the reload's.
        open.clear();
        if (navigation) navigation.retry();
        // After page.goto returned (its module never ran): load it again; the test's
        // waitForFunction runs again in the new document.
        else page.reload().catch(() => {});
      };
      const timer = setInterval(async () => {
        const now = Date.now(), late = [...open].filter(([, start]) => now - start >= stallTimeout);
        // Each stalled request is reported once.
        for (const [request] of late) open.delete(request);
        if (late.length) stalled(late);
        if (!retried && !navigation && !initializationError && !bootstrapChecked &&
            Number.isFinite(loaded) && now - loaded >= stallTimeout) {
          bootstrapChecked = true;
          const checkedLoad = loaded;
          try {
            // CSR bootstrap can stall after every asset answered. Only an empty SvelteKit
            // mount qualifies; mounted loading/error UI and runtime failures stay visible.
            const blank = await page.evaluate(() => {
              const root = document.querySelector('body > div[style="display: contents"]');
              return !!root && [...root.childNodes].every(node => node.nodeType === 3
                ? !node.textContent.trim() : ["SCRIPT", "STYLE"].includes(node.nodeName));
            });
            if (blank && loaded === checkedLoad && !retried && !initializationError && !navigation)
              stalled([], true);
          } catch { /* The page closed or navigated while checked. */ }
        }
      }, 1000);
      timers.add(timer);
      page.on("close", () => (clearInterval(timer), timers.delete(timer), open.clear()));
      const goto = page.goto.bind(page);
      // A stall during page.goto is retried by it, so its caller sees the retry's response
      // rather than the aborted first navigation's error, within the caller's timeout.
      page.goto = async (url, options = {}) => {
        // A previous document can leave an unanswered worker request behind. It must
        // not reload the next example, and that example gets its own single retry.
        open.clear();
        retried = false;
        bootstrapChecked = false;
        initializationError = false;
        loaded = -Infinity;
        let retry;
        const again = new Promise((resolve) => (retry = resolve));
        const current = (navigation = { retry }), start = Date.now();
        try {
          const first = goto(url, options);
          const outcome = await Promise.race([first.then((response) => ({ response })), again.then(() => null)]);
          if (outcome) return outcome.response;
          first.catch(() => {});
          const timeout = options.timeout ? Math.max(1, options.timeout - (Date.now() - start)) : options.timeout;
          return await goto(url, { ...options, timeout });
        } finally {
          if (navigation === current) {
            navigation = null;
            loaded = Date.now();
          }
        }
      };
    };
    context.pages().forEach(watch);
    context.on("page", watch);
    await use(context);
    timers.forEach(clearInterval);
  },
});
