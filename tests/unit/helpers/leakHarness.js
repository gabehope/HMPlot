// Leak and double-dispose harness (refactor plan P0, "Leak and double-dispose harness"). Opt-in:
//
//   LEAK_CHECK=1 node --import ./tests/unit/helpers/leakHarness.js --test tests/unit/<file>.test.js
//
// For the duration of each test it records every jax-js Array reference with its stack: construction
// (a new array holds one), `.ref` and `dispose()`. A test fails when references it acquired are still
// held at its end, when it released more references to an older array than it acquired, or when
// `dispose()` runs on an array already freed (jax-js throws then, but a caller can catch it).
// Without LEAK_CHECK, importing this file changes nothing. Node 24 applies a preload's top-level
// hooks to every test in the process; a test and its subtests are one window, and tests must not run
// concurrently. A test that failed is not checked.
//
// Retention policy: an array kept by a module-level cache outlives the test that filled the cache.
// An array this test created through a cache named in RETAINED below may keep one reference (the
// cache's), and one more for each reference such a cache acquired (`acquires`); anything else
// still held is reported, including a second reference a caller leaked. A cache's own release
// (`releases`) of an array it kept from an earlier test is not this test's imbalance.
import { afterEach, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import { Array as JaxArray } from "@hmplot/jax";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Caches that keep arrays on purpose: an array is theirs when it was created under `frame`, and a
 * reference is theirs when it was acquired with a stack matching `acquires` or released with one
 * matching `releases`.
 */
const RETAINED = [
  // jit() keeps each trace's ClosedJaxpr, whose consts are the concrete arrays created while tracing.
  // Tracing runs inside runWithCache (makeJaxpr returns an anonymous closure, so it names no frame).
  // A jit called while another traces (reduceValues' reducers inside a planProgram) passes its
  // consts to the outer trace (`jaxpr.consts.map((c) => c.ref)` in jax-js jit's `result`
  // closure), and the outer ClosedJaxpr keeps that reference: each jit's dispose() releases one.
  {
    cache: "jit trace constants",
    frame: /\bat runWithCache \(/,
    acquires:
      /^Error\n\s*at \S*vendor\/jax-js\/dist\/index\.js:\d+:\d+\n\s*at Array\.map \(<anonymous>\)\n\s*at result \(\S*vendor\/jax-js\/dist\/index\.js:\d+:\d+\)\n[\s\S]*\bat runWithCache \(/,
  },
  // adoptJax keeps one copy per array from another jax-js copy, disposed by a FinalizationRegistry
  // when the app's array is collected, which may be during a later test.
  {
    cache: "foreign jax copies",
    frame: /\bat adoptJax \(\S*src\/lib\/plot\/utils\/foreignJax\.js:/,
    releases:
      /^Error\n\s*at release \(\S*src\/lib\/plot\/utils\/foreignJax\.js:/,
  },
  // A retained row mapping keeps a bounded LRU of the gathers made through it (Stage 109).
  {
    cache: "row-mapping gathers",
    frame: /src\/lib\/plot\/utils\/gatherCache\.js:/,
  },
];

let window = null,
  depth = 0;
const freed = new WeakMap();

function capture(above) {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 60;
  const holder = {};
  Error.captureStackTrace(holder, above);
  Error.stackTraceLimit = limit;
  return holder;
}

/** The frames of a captured stack that are this repository's code, repo-relative. */
function frames(holder, count = 6) {
  if (!holder) return [];
  return holder.stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim().replace("file://", "").replace(root, ""))
    .filter(
      (line) =>
        !/vendor\/jax-js\/|node_modules\/|\(node:|^at node:|\(<anonymous>\)|leakHarness\.js/.test(
          line,
        ),
    )
    .slice(0, count);
}
/** The first repository frame, or else the jax-js function (a release inside `data()`, say). */
const site = (holder) =>
  frames(holder, 1)[0]?.replace(/^at (async )?/, "") ??
  `jax-js ${holder.stack
    .split("\n")[1]
    ?.trim()
    .replace(/^at (async )?/, "")
    .replace(/ \(.*$/, "")}`;

function note(array, delta, holder, created = false) {
  let entry = window.held.get(array);
  if (!entry)
    window.held.set(
      array,
      (entry = { array, created: null, acquired: [], released: [], net: 0 }),
    );
  if (created) entry.created = holder;
  else (delta > 0 ? entry.acquired : entry.released).push(holder);
  entry.net += delta;
  if (entry.net === 0) window.held.delete(array);
}

function install() {
  const base = Object.getPrototypeOf(JaxArray);
  Object.setPrototypeOf(
    JaxArray,
    new Proxy(base, {
      construct: function construct(target, args, newTarget) {
        const array = Reflect.construct(target, args, newTarget);
        if (window) note(array, 1, capture(construct), true);
        return array;
      },
    }),
  );
  const proto = JaxArray.prototype;
  const ref = Object.getOwnPropertyDescriptor(proto, "ref").get,
    dispose = proto.dispose;
  // `.ref` on a freed array is not reported: it throws, and a test may probe for a release so.
  Object.defineProperty(proto, "ref", {
    configurable: true,
    get: function acquire() {
      if (window && this.refCount > 0) note(this, 1, capture(acquire));
      return ref.call(this);
    },
  });
  proto.dispose = function release() {
    if (window) {
      if (this.refCount <= 0)
        window.misuses.push({ holder: capture(release), ...freed.get(this) });
      else {
        const holder = capture(release),
          entry = window.held.get(this);
        if (this.refCount === 1)
          freed.set(this, { freedBy: holder, createdBy: entry?.created });
        note(this, -1, holder);
      }
    }
    return dispose.call(this);
  };
  // A read releases its array only after the kernels it waits on compile, which can take longer
  // than a few turns of the event loop: the window records reads so that it can wait for them.
  const data = proto.data;
  proto.data = function read() {
    const pending = data.call(this);
    window?.reads.push(pending);
    return pending;
  };
}

const indent = (lines, by) =>
  lines.map((line) => " ".repeat(by) + line).join("\n");
const counted = (holders) => {
  const sites = new Map();
  for (const holder of holders)
    sites.set(site(holder), (sites.get(site(holder)) ?? 0) + 1);
  return [...sites]
    .map(([where, n]) => (n > 1 ? `${where} (x${n})` : where))
    .join(", ");
};

/** How many of `holders` a RETAINED cache's `key` pattern (acquires or releases) matches. */
const byCache = (holders, key) =>
  holders.filter((holder) =>
    RETAINED.some((cache) => cache[key]?.test(holder.stack)),
  ).length;

/** The references a cache still holds (as RETAINED describes) cover what this test left. */
function retained(entry) {
  const kept =
    (entry.created &&
    RETAINED.some(({ frame }) => frame.test(entry.created.stack))
      ? 1
      : 0) + byCache(entry.acquired, "acquires");
  const net = entry.net + byCache(entry.released, "releases");
  return net >= 0 && net <= kept;
}

function report({ held, misuses }) {
  const groups = new Map();
  for (const entry of held.values()) {
    if (retained(entry)) continue;
    const key = [
      entry.net > 0,
      frames(entry.created).join("|"),
      counted(entry.acquired),
      counted(entry.released),
    ].join("#");
    const group = groups.get(key) ?? { entry, arrays: 0, references: 0 };
    group.arrays++;
    group.references += Math.abs(entry.net);
    groups.set(key, group);
  }
  const sections = [];
  for (const { entry, arrays, references } of groups.values()) {
    const what = `${references} reference(s) to ${arrays} array(s) like ${entry.array.toString()}`;
    const lines = [
      entry.net > 0
        ? `${what} still held`
        : `${what} released, acquired before this test`,
    ];
    lines.push(
      entry.created ? "created" : "acquired before this test",
      ...indent(frames(entry.created), 2).split("\n").filter(Boolean),
    );
    if (entry.acquired.length) lines.push(`.ref at ${counted(entry.acquired)}`);
    if (entry.released.length)
      lines.push(`released at ${counted(entry.released)}`);
    sections.push(indent(lines, 2));
  }
  for (const { holder, freedBy, createdBy } of misuses) {
    const lines = [
      "dispose() on an array already freed",
      ...indent(frames(holder), 2).split("\n"),
    ];
    if (freedBy) lines.push(`freed at ${site(freedBy)}`);
    if (createdBy) lines.push(`created at ${site(createdBy)}`);
    sections.push(indent(lines, 2));
  }
  return sections.length ? `Leak check:\n${sections.join("\n")}` : null;
}

if (process.env.LEAK_CHECK) {
  install();
  beforeEach(() => {
    if (depth++ === 0) window = { held: new Map(), misuses: [], reads: [] };
  });
  afterEach(async (t) => {
    if (depth > 1) return void depth--;
    // Work the test started but did not await (a `.data()` read and its `.then`) finishes first.
    do {
      await Promise.allSettled(window.reads.splice(0));
      for (let turn = 0; turn < 2; turn++)
        await new Promise((resolve) => setImmediate(resolve));
    } while (window.reads.length);
    depth--;
    const closed = window;
    window = null;
    const failure = t.passed === false ? null : report(closed);
    if (failure) {
      const error = new Error(failure);
      error.stack = failure;
      throw error;
    }
  });
}
