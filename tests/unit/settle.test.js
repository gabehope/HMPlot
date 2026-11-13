import test from "node:test";
import assert from "node:assert/strict";
import { trackPreparation, settlePreparations, settleClock, publishWithCause, currentCause, rendererActivityChanged, afterCompletedFrame } from '../../src/lib/plot/rendering/viewSettlement.js';
import { createMarkPreparation } from "../../src/lib/plot/utils/markPreparation.js";
import { latestPreparation } from "../../src/lib/plot/utils/latestPreparation.js";
import { createViewServices } from "../../src/lib/plot/utils/viewServices.ts";

// TODO 17.15: settling waits for the work caused before the call (and its follow-ups), not for
// requests made later, so continuous updates cannot keep it waiting forever.
const deferred = () => { let resolve; const promise = new Promise((r) => (resolve = r)); return { promise, resolve }; };
const flush = () => new Promise((r) => setTimeout(r, 0));

test("geometry preparation finishes active work, keeps only the latest request and yields to a draw", async () => {
  const view = createViewServices(), work = deferred(), shown = [], canceled = [];
  const tasks = latestPreparation(signal => afterCompletedFrame(view, signal));
  const first = tasks.run(async () => { await work.promise; shown.push(1); }, () => canceled.push(1));
  const skipped = tasks.run(() => shown.push(2), () => canceled.push(2));
  const latest = tasks.run(() => shown.push(3), () => canceled.push(3));
  await skipped;
  assert.deepEqual(canceled, [2]);
  work.resolve(); await first;
  assert.deepEqual(shown, [1], "active work publishes even while input changes");
  for (const draw of view.lifecycle.frameCallbacks) draw();
  await latest;
  assert.deepEqual(shown, [1, 3]);
  const waiting = tasks.run(() => shown.push(4), () => canceled.push(4));
  tasks.dispose(); await waiting;
  assert.deepEqual(canceled, [2, 4]);
  assert.equal(view.lifecycle.frameCallbacks.size, 0);
});

test("geometry draw barriers resume for paused views and canceled preparations", async () => {
  const view = createViewServices();
  const held = afterCompletedFrame(view);
  view.lifecycle.renderHeld = true;
  rendererActivityChanged(view);
  await held;
  assert.equal(view.lifecycle.frameCallbacks.size, 0);
  await afterCompletedFrame(view); // Already held: never wait for an impossible draw.
  view.lifecycle.renderHeld = false;
  const abort = new AbortController(), canceled = afterCompletedFrame(view, abort.signal);
  abort.abort(); await canceled;
  assert.equal(view.lifecycle.frameCallbacks.size, 0);
});

test("disposing geometry preparation waits for active readers and immediately releases queued work", async () => {
  const read = deferred(), canceled = [], released = [];
  const tasks = latestPreparation();
  const first = tasks.run(async () => { await read.promise; released.push(1); }, started => canceled.push([1, started]));
  const queued = tasks.run(assert.fail, started => { canceled.push([2, started]); released.push(2); });
  let done = false;
  const settled = tasks.dispose().then(() => done = true);
  await queued;
  assert.deepEqual(canceled, [[1, true], [2, false]]);
  assert.deepEqual(released, [2]);
  assert.equal(done, false);
  read.resolve(); await first; await settled;
  assert.deepEqual(released, [2, 1]);
});

test("settlePreparations waits for earlier work, not for requests made after it was called", async () => {
  const view = createViewServices(), early = deferred(), late = deferred();
  trackPreparation(view, early.promise);
  const until = settleClock();
  trackPreparation(view, late.promise); // a new request: the next frame's change
  let done = false;
  const settled = settlePreparations(view, until).then(() => (done = true));
  await flush();
  assert.equal(done, false, "the earlier job is still running");
  early.resolve();
  await settled;
  assert.equal(done, true, "resolves while the later request is still running");
  late.resolve();
});

test("work started while a result is published inherits its cause and is waited for", async () => {
  const view = createViewServices(), first = deferred(), followUp = deferred();
  const cause = currentCause(view);
  trackPreparation(view, first.promise, cause);
  const until = settleClock();
  let done = false;
  const settled = settlePreparations(view, until).then(() => (done = true));
  // The first job publishes its result; a consumer starts work in response.
  publishWithCause(view, cause, () => trackPreparation(view, followUp.promise));
  first.resolve();
  await flush();
  assert.equal(done, false, "the follow-up counts");
  followUp.resolve();
  await settled;
  assert.equal(done, true);
  // Once the publication's update has flushed, new work is a new request again.
  await flush();
  assert.ok(currentCause(view) > until);
});

test("a superseded request counts as settled; continuous requests never block", async () => {
  const view = createViewServices();
  const running = deferred();
  trackPreparation(view, running.promise);
  const until = settleClock();
  // Every "frame" starts a new request and the previous one is aborted.
  let frames = 0, previous = running;
  const timer = setInterval(() => {
    const next = deferred();
    trackPreparation(view, next.promise);
    previous.resolve(); // aborted: its promise settles
    previous = next;
    frames++;
  }, 1);
  await settlePreparations(view, until);
  clearInterval(timer);
  previous.resolve();
  assert.ok(frames >= 1);
});

test("a rejected job settles its barrier", async () => {
  const view = createViewServices(), failing = deferred();
  const work = failing.promise.then(() => { throw Error("boom"); });
  work.catch(() => {});
  trackPreparation(view, work);
  const settled = settlePreparations(view, settleClock());
  failing.resolve();
  await settled;
  assert.equal(view.lifecycle.preparations.size, 0);
});

test("atomic uploads settle before draw publication, then wait for it after rendering resumes", async () => {
  const held = createViewServices(), other = createViewServices(), data = deferred(), axes = deferred(), otherAxes = deferred();
  trackPreparation(held, data.promise);
  trackPreparation(held, axes.promise, undefined, { draw: true });
  trackPreparation(other, otherAxes.promise, undefined, { draw: true });
  let done = false;
  const preparing = settlePreparations(held, settleClock(), { everywhere: true }).then(() => { done = true; });
  // A hold can start after a reveal already began waiting for its first draw.
  await flush();
  held.lifecycle.renderHeld = true;
  rendererActivityChanged(held);
  data.resolve(); await flush();
  assert.equal(done, false, "draws in another, running plot still count");
  otherAxes.resolve(); await preparing;
  assert.equal(held.lifecycle.preparations.size, 1, "guide publication remains tracked");
  held.lifecycle.renderHeld = false;
  done = false;
  const drawn = settlePreparations(held).then(() => { done = true; });
  await flush();
  assert.equal(done, false);
  axes.resolve(); await drawn;
  assert.equal(held.lifecycle.preparations.size, 0);
  const hidden = deferred();
  trackPreparation(held, hidden.promise, undefined, { draw: true });
  const hiding = settlePreparations(held);
  held.lifecycle.drawable = false;
  rendererActivityChanged(held);
  await hiding;
  assert.equal(held.lifecycle.preparations.size, 1, "hidden views must not block other plots");
  hidden.resolve();
});

test("mark preparation publishes synchronously and carries a canceled request's cause", async () => {
  const view = createViewServices(), published = [];
  const coordinator = createMarkPreparation(view, {
    publish: (entry, cause) => published.push({ entry, cause, inherited: currentCause() }),
    report: assert.fail,
  });
  const first = coordinator.begin("current-request"), work = deferred();
  let released = 0;
  const pending = coordinator.finish(first, { dispose() { released++; } }, work.promise);
  coordinator.cancel(first);
  const second = coordinator.begin("current-request"), entry = { dispose: assert.fail };
  assert.equal(second.cause, first.cause);
  coordinator.finish(second, entry);
  assert.equal(published[0].entry, entry, "synchronous preparation never waits for a microtask");
  assert.equal(published[0].inherited, first.cause);
  work.resolve();
  await pending;
  assert.equal(released, 1);
  assert.equal(published.length, 1);
  coordinator.destroy();
});

test("readback preparation makes progress after cancellation but cannot replace a newer publication", async () => {
  const view = createViewServices(), shown = [], retired = [];
  const coordinator = createMarkPreparation(view, { publish: (entry) => shown.push(entry.id), report: assert.fail });
  const start = (id) => {
    const request = coordinator.begin("newest-completed"), work = deferred();
    const done = coordinator.finish(request, { id, dispose() { retired.push(id); } }, work.promise);
    return { request, work, done };
  };
  const a = start("a"); coordinator.cancel(a.request);
  const b = start("b");
  a.work.resolve(); await a.done;
  assert.deepEqual(shown, ["a"], "a stream may draw while its newer read is outstanding");
  coordinator.cancel(b.request);
  const c = start("c");
  c.work.resolve(); await c.done;
  b.work.resolve(); await b.done;
  assert.deepEqual(shown, ["a", "c"]);
  assert.deepEqual(retired, ["b"]);
  coordinator.destroy();
});

test("an accepted in-place update rejects older preparation and starts a fresh settlement cause", async () => {
  const view = createViewServices(), shown = [], retired = [];
  const coordinator = createMarkPreparation(view, { publish: entry => shown.push(entry.id), report: assert.fail });
  const old = coordinator.begin("newest-completed"), work = deferred();
  const pending = coordinator.finish(old, { id: "old", dispose() { retired.push("old"); } }, work.promise);
  const reuse = coordinator.begin("newest-completed");
  assert.equal(reuse.cause, old.cause);
  coordinator.cancel(reuse);
  assert.equal(coordinator.accept(reuse), true, "a completed readback update may land after effect cancellation");
  work.resolve(); await pending;
  assert.deepEqual(shown, [], "an older entry cannot replace the fields already updated in place");
  assert.deepEqual(retired, ["old"]);
  await flush();
  const fresh = coordinator.begin("newest-completed");
  assert.ok(fresh.cause > old.cause, "later live frames do not inherit the completed barrier's cause");
  assert.equal(coordinator.accept(old), false, "a late acceptance cannot lower the completed order");
  assert.equal(coordinator.accept(fresh), true);
  coordinator.destroy();
  assert.equal(coordinator.accept(coordinator.begin("newest-completed")), false);
});

test("curve preparation reaches a drawn frame before a pending input replaces it", async (t) => {
  const previousRAF = globalThis.requestAnimationFrame, frames = [];
  globalThis.requestAnimationFrame = callback => (frames.push(callback), frames.length);
  t.after(() => { if (previousRAF) globalThis.requestAnimationFrame = previousRAF; else delete globalThis.requestAnimationFrame; });
  const view = createViewServices(), shown = [];
  view.lifecycle.geometryBusy = true;
  view.lifecycle.completedFrame = 1;
  const coordinator = createMarkPreparation(view, { publish: entry => shown.push(entry.id), report: assert.fail });
  const request = coordinator.begin("newest-completed");
  const finished = coordinator.finish(request, { id: 2, dispose: assert.fail });
  coordinator.cancel(request); // Readback-only work still completes after cancellation.
  assert.deepEqual(shown, []);
  view.lifecycle.geometryBusy = false;
  view.lifecycle.completedFrame++;
  frames.shift()(0);
  await finished;
  assert.deepEqual(shown, [2]);
  coordinator.destroy();
});

test("destruction keeps late preparation tracked until its readers finish, then releases it", async () => {
  const view = createViewServices(), work = deferred();
  const coordinator = createMarkPreparation(view, { publish: assert.fail, report: assert.fail });
  const request = coordinator.begin("newest-completed");
  let released = 0, settled = false;
  coordinator.finish(request, { dispose() { released++; } }, work.promise);
  const barrier = settlePreparations(view).then(() => { settled = true; });
  coordinator.destroy();
  await flush();
  assert.equal(request.signal.aborted, true);
  assert.equal(settled, false);
  assert.equal(released, 0);
  work.resolve();
  await barrier;
  assert.equal(released, 1);
});

test("a superseded current request releases its failed result without reporting a stale error", async () => {
  const view = createViewServices(), work = deferred(), errors = [];
  const coordinator = createMarkPreparation(view, { publish: assert.fail, report: (e) => errors.push(e) });
  const first = coordinator.begin("current-request");
  let released = 0;
  const pending = coordinator.finish(first, { dispose() { released++; } }, work.promise.then(() => {
    throw Error("old invalid curve");
  }));
  coordinator.cancel(first);
  const second = coordinator.begin("current-request");
  work.resolve();
  await pending;
  await settlePreparations(view);
  assert.equal(released, 1);
  assert.deepEqual(errors, [], "the replacement need not publish before old errors become stale");
  assert.equal(view.lifecycle.preparations.size, 0);
  coordinator.finish(second);
  coordinator.destroy();
});

test("failed preparation releases its entry and settles with one reported error", async () => {
  const view = createViewServices(), errors = [], error = Error("invalid series");
  const coordinator = createMarkPreparation(view, { publish: assert.fail, report: (e) => errors.push(e) });
  let released = 0;
  const request = coordinator.begin("current-request");
  coordinator.cancel(request); // Synchronous preparation failures abort their readers before reporting.
  await coordinator.finish(request, { dispose() { released++; } }, Promise.reject(error));
  await settlePreparations(view);
  assert.equal(released, 1);
  assert.deepEqual(errors, [error]);
  assert.equal(view.lifecycle.preparations.size, 0);
  coordinator.destroy();
});
