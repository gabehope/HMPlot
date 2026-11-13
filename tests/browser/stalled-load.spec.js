import { test, expect } from "./fixtures.js";

// The suite's stalled-load retry (fixtures.js, TODO 136.1b), with a request held unanswered as a
// stalled one is: the page loads again once, and each stall is annotated. Twice the slowest
// module load under four workers (a cold server's take seconds: the page is loaded first,
// unwatched).
const stallTimeout = 15000;
test.use({ stallTimeout });
test.beforeAll(async ({ browser }, info) => {
  const page = await browser.newPage({ baseURL: info.project.use.baseURL });
  await page.goto("/test/axis-controls");
  await ready(page);
  await page.close();
});

const ready = (page) => page.waitForFunction(() => window.axisControls?.plot);
const stalls = (info) => info.annotations.filter((a) => a.type === "stalled-load").map((a) => a.description);
// Holds the first `count` requests matching `pattern` without an answer; the rest load.
async function hold(page, pattern, count = 1) {
  let held = 0;
  await page.route(pattern, (route) => (held++ < count ? undefined : route.continue()));
}

test("a page whose document never answers is loaded again by the same page.goto", async ({ page }, info) => {
  await hold(page, "**/test/axis-controls");
  await page.goto("/test/axis-controls");
  await ready(page);
  expect(stalls(info)).toEqual([expect.stringMatching(/^GET http:\/\/127\.0\.0\.1:5173\/test\/axis-controls \(document, \d+ s\)$/)]);
});

test("a page whose module never loads is loaded again, and the test's wait runs in the new page", async ({ page }, info) => {
  await hold(page, "**/src/routes/test/axis-controls/+page.svelte*");
  await page.goto("/test/axis-controls");
  await ready(page);
  expect(stalls(info)).toEqual([expect.stringContaining("/src/routes/test/axis-controls/+page.svelte")]);
});

test("a second stall is annotated and not retried", async ({ page }, info) => {
  await hold(page, "**/test/axis-controls", 2);
  await expect(page.goto("/test/axis-controls", { timeout: 3 * stallTimeout })).rejects.toThrow(/Timeout/);
  expect(stalls(info)).toEqual([expect.not.stringContaining("not retried"), expect.stringContaining("(after a reload; not retried)")]);
});

test("a request that stalls once the test is under way is annotated, and the page kept", async ({ page }, info) => {
  await page.goto("/test/axis-controls");
  await ready(page);
  await page.evaluate(() => (window.kept = true));
  // Past the fixture's 10 s window after page.goto, in which a module counts as the page's load.
  await page.waitForTimeout(10500);
  await hold(page, "**/late-module.js");
  await page.evaluate(() => void import("/late-module.js").catch(() => {}));
  await expect.poll(() => stalls(info), { timeout: 2 * stallTimeout }).toEqual([expect.stringMatching(/late-module\.js \(script, \d+ s\) \(after the page loaded; not retried\)$/)]);
  expect(await page.evaluate(() => window.kept)).toBe(true);
});

test("a page that loads is not annotated", async ({ page }, info) => {
  await page.goto("/test/axis-controls");
  await ready(page);
  expect(stalls(info)).toEqual([]);
});


test("each deliberate navigation gets one recovery without carrying the previous load's retry", async ({ page }, info) => {
  for (let navigation = 0; navigation < 2; navigation++) {
    await page.unroute("**/test/axis-controls");
    await hold(page, "**/test/axis-controls");
    await page.goto("/test/axis-controls", { timeout: 3 * stallTimeout });
    await ready(page);
    await expect(page.locator("section.plot canvas").first()).toBeVisible();
  }
  expect(stalls(info)).toHaveLength(2);
  expect(stalls(info).every(note => !note.includes("not retried"))).toBe(true);
});


test("an empty CSR bootstrap gets one annotated reload even when its assets answered", async ({ page }, info) => {
  let requests = 0;
  await page.route("**/test/axis-controls", route => requests++ === 0
    ? route.fulfill({ contentType: "text/html", body: '<!doctype html><div style="display: contents"></div>' })
    : route.continue());
  await page.goto("/test/axis-controls");
  await ready(page);
  await expect(page.locator("section.plot canvas").first()).toBeVisible();
  expect(requests).toBe(2);
  expect(stalls(info)).toEqual([expect.stringContaining("blank bootstrap")]);
});

test("an empty bootstrap with a JavaScript error is retained without a retry", async ({ page }, info) => {
  let requests = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/test/axis-controls", route => {
    requests++;
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div style="display: contents"><script>throw new Error("bootstrap fixture failure")</script></div>' });
  });
  await page.goto("/test/axis-controls");
  await expect.poll(() => errors).toEqual(["bootstrap fixture failure"]);
  await page.waitForTimeout(stallTimeout + 2500);
  await expect(page.locator("section.plot")).toHaveCount(0);
  expect(requests).toBe(1);
  expect(stalls(info)).toEqual([]);
});
