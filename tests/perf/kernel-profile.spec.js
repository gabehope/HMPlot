// Scratch: GPU time per kernel during a gesture, from jax-js's profiler (timestamp queries).
//   PERF=1 PAGE=/examples/mona-lisa-histogram npx playwright test --config ... tests/perf/kernel-profile.spec.js
import { test as base } from "@playwright/test";
const test = process.env.PERF ? base : base.skip;
test("kernel profile", async ({ page }) => {
  await page.goto(process.env.PAGE ?? "/examples/mona-lisa-histogram");
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].length > 0 && [...document.querySelectorAll(".canvas")].every((c) => c.getAttribute("aria-busy") === "false"), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const b = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  const drag = async (from, to) => {
    await page.keyboard.down("Shift");
    await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) await page.mouse.move(b.x + b.width * (from[0] + (to[0] - from[0]) * i / 16), b.y + b.height * (from[1] + (to[1] - from[1]) * i / 16));
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.waitForTimeout(800);
  };
  await drag([0.2, 0.2], [0.5, 0.5]); // warm: compiles
  await page.mouse.click(5, 5); await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map((e) => e.name).find((n) => /@jax-js_jax\.js/.test(n));
    const jax = await import(url);
    window.__jaxProfiler = jax.profiler;
    performance.clearMeasures();
    jax.profiler.startTrace();
  });
  await drag([0.3, 0.25], [0.65, 0.6]);
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(() => {
    window.__jaxProfiler.stopTrace();
    const by = new Map();
    for (const m of performance.getEntriesByType("measure")) {
      const d = m.detail?.devtools; if (d?.trackGroup !== "JAX Profiler") continue;
      const p = Object.fromEntries(d.properties ?? []);
      const key = `${m.name} ${p.reduction ?? ""} ${(p.exp ?? p.inputShapes ?? "").slice(0, 160)}`;
      const e = by.get(key) ?? { key, n: 0, ms: 0, source: p.source };
      e.n++; e.ms += m.duration; by.set(key, e);
    }
    return [...by.values()].sort((a, b) => b.ms - a.ms);
  });
  const total = rows.reduce((s, r) => s + r.ms, 0);
  console.log(`TOTAL gpu ms ${total.toFixed(1)} over ${rows.reduce((s, r) => s + r.n, 0)} dispatches`);
  for (const r of rows.slice(0, 12)) console.log(`${r.ms.toFixed(2).padStart(8)} ms  x${r.n}  ${r.key}`);
  if (process.env.DUMP) for (const r of rows.filter((r) => new RegExp(process.env.DUMP).test(r.key)).slice(0, 2)) console.log(`---- ${r.key}\n${r.source}`);
});
