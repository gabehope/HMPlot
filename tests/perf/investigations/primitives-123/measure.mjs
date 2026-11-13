import { chromium } from "playwright-core";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { cpus, platform, arch } from "node:os";
import {
  installGpuCounters,
  installGpuErrors,
} from "../../../browser/gpu-counters.js";
import {
  installGpuTiming,
  gpuTimingArgs,
  startGpuTiming,
  stopGpuTiming,
} from "../gpu-timing.mjs";
const url = process.env.PRIMITIVE_URL ?? "http://127.0.0.1:5193";
const snapshot = resolve(
  process.env.PRIMITIVE_SNAPSHOT ?? "/tmp/hmplot-123-frozen",
);
const kind = process.env.PRIMITIVE_MODE ?? "plain";
const part = process.env.PRIMITIVE_PART ?? "all";
const out = resolve(
  process.env.PRIMITIVE_OUT ?? `/tmp/hmplot-123-${kind}.json`,
);
const reps = Number(process.env.PRIMITIVE_REPS ?? (kind === "plain" ? 6 : 2));
const warmups = 2;
if (
  !["plain", "counters", "gpu"].includes(kind) ||
  !["all", "compact", "history", "moving"].includes(part) ||
  !Number.isInteger(reps) ||
  reps < 1
)
  throw Error("Invalid PRIMITIVE_MODE, PRIMITIVE_PART or PRIMITIVE_REPS.");
const sha = (data) => createHash("sha256").update(data).digest("hex");
const manifestBytes = await readFile(join(snapshot, "PRIMITIVE-SNAPSHOT.json"));
const manifest = JSON.parse(manifestBytes);
// Verify every archived source and owned fixture before using the build.
for (const [path, hash] of Object.entries(manifest.files))
  if (sha(await readFile(join(snapshot, path))) !== hash)
    throw Error(`Frozen source changed: ${path}`);
const build = {};
async function fingerprint(dir) {
  for (const item of await readdir(join(snapshot, "primitive-build", dir), {
    withFileTypes: true,
  })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await fingerprint(path);
    else
      build[path] = sha(
        await readFile(join(snapshot, "primitive-build", path)),
      );
  }
}
await fingerprint("");
const result = {
  date: new Date().toISOString(),
  baseline: manifest.baseline,
  kind,
  part,
  warmups,
  reps,
  snapshot,
  manifestSha256: sha(manifestBytes),
  build,
  host: { platform: platform(), arch: arch(), cpu: cpus()[0].model },
  samples: [],
  correctness: [],
};
const save = () => writeFile(out, JSON.stringify(result, null, 2));
await mkdir(resolve(out, ".."), { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", ...(kind === "gpu" ? gpuTimingArgs : [])],
});
result.browser = browser.version();
async function open(moving = false) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
  await page.addInitScript(installGpuErrors);
  if (kind === "counters") await page.addInitScript(installGpuCounters);
  if (kind === "gpu") await page.addInitScript(installGpuTiming);
  await page.goto(url + (moving ? "/?moving" : "/"));
  if (
    sha(await (await page.request.get(url + "/")).body()) !==
    build["index.html"]
  )
    throw Error("Served HTML differs from the frozen build.");
  // Check all loaded local assets against the frozen build, including the HTML entry.
  const responses = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => e.name),
  );
  for (const name of responses.filter((x) => x.startsWith(url + "/assets/"))) {
    const path = new URL(name).pathname.slice(1);
    if (
      sha(Buffer.from(await (await page.request.get(name)).body())) !==
      build[path]
    )
      throw Error(`Served build mismatch: ${path}`);
  }
  await page.waitForFunction(() => window.primitives, null, {
    timeout: 120000,
  });
  const info = await page.evaluate(() => window.primitives.initialize());
  result.adapter ??= info;
  if (moving) {
    await page.waitForFunction(
      () =>
        window.__movingParticles?.plot &&
        document.querySelector(".canvas") &&
        [...document.querySelectorAll(".canvas")].every(
          (c) => c.getAttribute("aria-busy") === "false",
        ),
      null,
      { timeout: 120000 },
    );
    await page.evaluate(() => window.primitives.movingMode("sort"));
  }
  if (kind === "counters")
    await page.evaluate(() => {
      window.__recordPrimitiveCalls = true;
      window.__primitiveCalls = { compact: 0, bucket: 0, brackets: 0 };
    });
  return { page, errors };
}
const call = (page, name, args) =>
  page.evaluate(({ name, args }) => window.primitives[name](args), {
    name,
    args,
  });
const order = (rep, arms) => (rep % 2 ? [...arms].reverse() : arms);
async function record(page, name, args, metadata) {
  const calls =
    kind === "counters"
      ? await page.evaluate(() => ({ ...window.__primitiveCalls }))
      : null;
  if (kind === "gpu") await startGpuTiming(page);
  const value = await call(page, name, args);
  if (kind === "gpu")
    value.gpu = await stopGpuTiming(page, value.completedFrames ?? 1);
  if (calls)
    value.primitiveCalls = await page.evaluate(
      (before) =>
        Object.fromEntries(
          Object.entries(window.__primitiveCalls).map(([key, value]) => [
            key,
            value - before[key],
          ]),
        ),
      calls,
    );
  result.samples.push({ ...metadata, ...value });
}
try {
  if (part === "all" || part === "compact") {
    const { page, errors } = await open();
    result.correctness.push({
      workload: "integration",
      checks: await call(page, "integrationCorrectness"),
    });
    // Alternate methods and row counts within every repetition; do not time all 90k first.
    for (let rep = -warmups; rep < reps; rep++)
      for (const n of order(rep, [90000, 500000]))
        for (const visibility of ["none", "all", "sparse", "dense"])
          for (const bucket of [false, true])
            for (const method of order(rep, ["sort", "scan"])) {
              const args = {
                n,
                visibility,
                bucket,
                method,
                phase: Math.max(0, rep) * 37,
                verify: rep < 0,
              };
              if (rep < 0) {
                await call(page, "compaction", args);
              } else
                await record(page, "compaction", args, {
                  workload: "compact",
                  rep,
                });
            }
    result.correctness.push({
      workload: "compact",
      status: "stable ids/counts/bucket mask checked in both warmups",
      errors,
      gpuErrors: await page.evaluate(() => window.__gpuErrors),
    });
    await page.close();
    await save();
  }
  if (part === "all" || part === "history") {
    const { page, errors } = await open();
    for (const [entities, steps] of [
      [1500, 60],
      [250, 360],
      [5000, 100],
      [1500, 333],
      [150, 3000],
      [32, 16384],
    ])
      for (const visibility of ["all", "entities", "holes", "none"]) {
        await call(page, "setupHistory", { entities, steps, visibility });
        for (let rep = -warmups; rep < reps; rep++) {
          const at = steps * (0.3 + ((rep + warmups) % 5) * 0.1) + 0.25;
          for (const changing of [false, true])
            for (const method of order(rep, ["scan", "search"])) {
              const args = {
                method,
                at,
                changing,
                phase: (rep + warmups) * 37,
                verify: rep < 0,
              };
              if (rep < 0) await call(page, "bracket", args);
              else
                await record(page, "bracket", args, {
                  workload: "bracket",
                  rep,
                  entities,
                  steps,
                  visibility,
                });
            }
        }
        // Restore original input mask for complete Slice; bracket-only changing masks stay local.
        await call(page, "setupHistory", { entities, steps, visibility });
        for (let rep = -warmups; rep < reps; rep++)
          for (const method of order(rep, ["scan", "search", "oracle"])) {
            const args = {
              method,
              at: steps * (0.4 + ((rep + warmups) % 3) * 0.1) + 0.25,
              verify: rep < 0,
            };
            if (rep < 0) await call(page, "fullSlice", args);
            else
              await record(page, "fullSlice", args, {
                workload: "fullSlice",
                rep,
                entities,
                steps,
                visibility,
              });
          }
        await call(page, "disposeHistory");
        await save();
        console.log("history", entities, steps, visibility);
      }
    result.correctness.push({
      workload: "history",
      status:
        "visible endpoints and validity checked against CPU oracle in both warmups",
      errors,
      gpuErrors: await page.evaluate(() => window.__gpuErrors),
    });
    await page.close();
    await save();
  }
  if (part === "all" || part === "moving") {
    const { page, errors } = await open(true);
    for (let rep = -warmups; rep < reps; rep++)
      for (const method of order(rep, ["sort", "scan", "search"])) {
        await call(page, "movingMode", method);
        for (const [i, minimum] of [0.3, 0.7, 0.05, 0.95, 0.3].entries()) {
          const args = { time: 12.25 + i * 3.5, minimum };
          if (rep < 0) await call(page, "movingFrame", args);
          else
            await record(page, "movingFrame", args, {
              workload: "moving-step",
              rep,
              method,
            });
        }
        if (rep < 0) await call(page, "movingLive", 1500);
        else
          await record(
            page,
            "movingLive",
            Number(process.env.PRIMITIVE_LIVE_MS ?? 3000),
            { workload: "moving-live", rep, method },
          );
        await call(page, "movingFrame", { time: 18.25, minimum: 0.3 });
        const png = await page.screenshot();
        result.correctness.push({
          workload: "moving",
          rep,
          method,
          screenshotSha256: sha(png),
          screenshot: `${out}.${rep}.${method}.png`,
        });
        await writeFile(`${out}.${rep}.${method}.png`, png);
        await save();
        console.log("moving", rep, method);
      }
    result.correctness.push({
      workload: "moving",
      errors,
      gpuErrors: await page.evaluate(() => window.__gpuErrors),
      calls: await page.evaluate(() => window.__primitiveCalls ?? null),
    });
    await page.close();
    await save();
  }
  if (result.correctness.some((x) => x.errors?.length || x.gpuErrors?.length))
    throw Error("Browser errors invalidate timing");
  result.complete = true;
} catch (error) {
  result.failure = error.stack;
  throw error;
} finally {
  await save();
  await browser.close();
}
console.log(out);
