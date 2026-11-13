// The merge gate (TODO 136.1): every check CI runs, plus the browser suite, which CI cannot run
// (it needs a GPU). A change goes to main only when this passes. A failing browser test blocks
// unless tests/browser/QUARANTINE.md lists it, with an owner and a date.
//
//   npm run gate            # everything
//   npm run gate -- --fast  # everything but the browser suite
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, openSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fast = process.argv.includes("--fast");
const run = (label, command, args, options = {}) => {
  console.log(`\n== ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  return result.status === 0;
};
const failed = [];
const check = (label, command, args, options) => {
  if (!run(label, command, args, options)) failed.push(label);
};

check("format", "npm", ["run", "format:check"]);
// The unit tests run under the leak harness (tests/unit/helpers/leakHarness.js): opt-in elsewhere,
// a leaked array went unnoticed for days (windows.js's sorted keys, 2026-10-16).
check("unit tests (leak check)", "npm", ["run", "test:leaks"]);
check("types", "npm", ["run", "check"]);
check("Python signatures", "npm", ["run", "check:python-signatures"]);
check("API report", "npm", ["run", "check:api"]);
// pytest draws through the local Python bundles, which git does not keep: built from this tree
// first, so the Python tests see its JavaScript (they ran against stale bundles before). New
// bundles make every example's build stale: they are built again here (current ones are skipped),
// or the suite's dev server rebuilt them in the background while the docs tests read them.
if (run("Python bundles", "npm", ["run", "build:python"])) {
  check("example builds", "npm", ["run", "build:examples"]);
  // The docs also serve Svelte-only gallery previews. CI disables the dev server's
  // background capture, so finish these before starting the browser suite.
  if (!fast) check("gallery thumbnails", "npm", ["run", "build:thumbnails"]);
  check("Python tests", ".venv/bin/python", ["-m", "pytest", "python/tests", "-q"], {
    env: { ...process.env, PYTHONPATH: "python" },
  });
} else failed.push("Python bundles (Python tests not run)");

/** Quarantined tests as "file:line" (tests/browser/QUARANTINE.md: `- file:line · owner · date · why`). */
const quarantined = () => {
  try {
    return new Set(
      readFileSync("tests/browser/QUARANTINE.md", "utf8")
        .split("\n")
        .map((line) => line.match(/^- (tests\/browser\/\S+:\d+) · \S.* · \d{4}-\d{2}-\d{2} · /)?.[1])
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
};

const portBusy = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });

if (!fast) {
  console.log("\n== browser suite");
  if (await portBusy(5173)) {
    // Playwright would reuse it; a long-lived server after edits miscounts builds (AGENTS.md).
    console.log("A dev server is running on 5173: stop it, so the suite starts a fresh one.");
    failed.push("browser suite (a dev server was running)");
  } else {
    // Tests tagged @timing count frames or time a response: they run after the rest, on one
    // worker, with the GPU to themselves (under four workers a drag drew 63 frames of 120).
    const folder = mkdtempSync(join(tmpdir(), "hmplot-gate-"));
    // The suite's own dev server (Playwright reuses it), its output kept: a page reload it sends
    // aborts every navigation in flight (TODO 136.1). CI=1: no gallery thumbnails captured in the
    // background (a second Chrome on the GPU; scripts/vite-examples.js), as in CI.
    const serverLog = join(folder, "dev-server.log"), out = openSync(serverLog, "a");
    const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, CI: "1", HMPLOT_SLOW_REQUESTS: "1" },
    });
    for (let i = 0; i < 240 && !(await portBusy(5173)); i++) await new Promise((r) => setTimeout(r, 500));
    const passes = [
      // @nightly tests (the scale sweep, TODO 136.18) run in the daily browser suite only.
      ["parallel", ["--grep-invert", "@timing|@nightly"]],
      ["timing", ["--grep", "@timing", "--grep-invert", "@nightly", "--workers=1", "--trace=off"]],
    ];
    const failures = [], traces = [], stalls = [];
    let reports = 0;
    for (const [name, args] of passes) {
      console.log(`\n-- ${name}`);
      const report = join(folder, `${name}.json`);
      // Each pass its own output folder: a run empties its folder, and the parallel pass's traces
      // are read after the timing pass.
      const output = join(folder, `${name}-results`);
      spawnSync("npx", ["playwright", "test", "--reporter=line,json", `--output=${output}`, ...args], {
        stdio: "inherit",
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
      });
      let results;
      try {
        results = JSON.parse(readFileSync(report, "utf8"));
        reports++;
      } catch {
        failed.push(`browser suite (no ${name} report)`);
        continue;
      }
      const visit = (suite) => {
        for (const spec of suite.specs ?? [])
          for (const t of spec.tests ?? []) {
            const id = `tests/browser/${spec.file.replace(/^tests\/browser\//, "")}:${spec.line}`;
            // Page loads the suite loaded again (tests/browser/fixtures.js), passed tests' too;
            // stalled-load.spec.js stalls its own on purpose.
            const loads = [...(t.annotations ?? []), ...(t.results ?? []).flatMap((r) => r.annotations ?? [])]
              .filter((a) => a.type === "stalled-load").map((a) => a.description);
            if (!spec.file.endsWith("stalled-load.spec.js"))
              for (const description of new Set(loads)) stalls.push([id, t.status, description]);
            if (t.status === "unexpected") {
              failures.push(id);
              for (const result of t.results ?? [])
                for (const a of result.attachments ?? []) if (a.name === "trace" && a.path) traces.push([id, a.path]);
            }
          }
        for (const child of suite.suites ?? []) visit(child);
      };
      for (const suite of results.suites ?? []) visit(suite);
    }
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    const logLines = readFileSync(serverLog, "utf8").split("\n");
    const reloads = logLines
      .filter((line) => /page reload|full reload|optimized dependencies|new dependencies/i.test(line));
    if (reloads.length) {
      console.log(`\nThe dev server reloaded pages during the suite (${serverLog}):`);
      for (const line of reloads.slice(0, 20)) console.log(`  ${line.trim()}`);
    }
    const slow = logLines.filter((line) => line.includes("Slow request:"));
    if (slow.length) {
      console.log(`\nThe dev server was slow to answer (${serverLog}):`);
      for (const line of slow.slice(0, 20)) console.log(`  ${line.trim()}`);
    }
    // A failed test's requests that never got a response, from its trace: a stalled page load
    // names what it waited on (TODO 136.1b). With the slow requests above: the server's side.
    // A request that failed (aborted when the page closed, say) has a failure text instead.
    for (const [id, trace] of traces) {
      const network = spawnSync("unzip", ["-p", trace, "*.network"], { encoding: "utf8", maxBuffer: 1 << 28 });
      if (network.status !== 0) {
        console.log(`\n${id}: its trace's requests could not be read (unzip: ${network.error?.message ?? network.stderr.trim()}): ${trace}`);
        continue;
      }
      const open = network.stdout.split("\n").flatMap((line) => {
        try {
          const { snapshot } = JSON.parse(line);
          return snapshot?.response?.status === -1 && !snapshot.response._failureText
            ? [`${snapshot.request.method} ${snapshot.request.url} (${snapshot._resourceType})`]
            : [];
        } catch {
          return [];
        }
      });
      if (open.length) {
        console.log(`\n${id}: ${open.length} request(s) never answered (${trace}):`);
        for (const request of open.slice(0, 10)) console.log(`  ${request}`);
      }
    }
    if (stalls.length) {
      console.log(`\nStalled page loads (TODO 136.1b; loaded again once, so a passed test had one):`);
      for (const [id, status, description] of stalls) console.log(`  ${id} (${status === "expected" ? "passed" : status}): ${description}`);
    }
    if (reports) {
      const allowed = quarantined();
      const blocking = [...new Set(failures)].filter((id) => !allowed.has(id));
      for (const id of new Set(failures)) console.log(`${allowed.has(id) ? "quarantined" : "FAILED"}: ${id}`);
      if (blocking.length) failed.push(`browser suite (${blocking.length} failing)`);
    }
  }
}

console.log(failed.length ? `\nGate: blocked by ${failed.join(", ")}.` : "\nGate: passed.");
process.exit(failed.length ? 1 : 0);
