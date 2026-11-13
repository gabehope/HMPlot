import { SCALE_TRANSFORMS, TRANSFORM_NAMES, STEP_KIND, DEFAULT_TRANSFORM_CONSTANT, scaleTransformWgsl, transformName,
  inTransformDomain, transformForward, transformInverse } from "./scaleTransforms.js";
import { Array as JaxArray } from "@hmplot/jax";
import { markAnimation } from "./markAnimation.js";
import { limitError } from "./limits.js";
import { ClockScope } from "./clockScope.js";
import { BooleanType, ScalarType, SelectType } from "../objects/types.js";
export const easings = [
  "linear",
  "quad-in",
  "quad-out",
  "quad-in-out",
  "cubic-in",
  "cubic-out",
  "cubic-in-out",
  "sine-in-out",
];
export function ease(t, kind = "cubic-in-out") {
  t = Math.max(0, Math.min(1, t));
  switch (kind) {
    case "linear":
      return t;
    case "quad-in":
      return t * t;
    case "quad-out":
      return t * (2 - t);
    case "quad-in-out":
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    case "cubic-in":
      return t ** 3;
    case "cubic-out":
      return 1 - (1 - t) ** 3;
    case "sine-in-out":
      return (1 - Math.cos(Math.PI * t)) / 2;
    default:
      return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  }
}
/**
 * Scale-space kinds for the per-row blend: how a channel interpolates between values. The scale
 * transforms' codes come from their table (utils/scaleTransforms.js); step is animation's own.
 */
/** @type {Readonly<Record<string, number>>} */
export const TRANSFORM_KINDS = Object.freeze({
  ...Object.fromEntries(TRANSFORM_NAMES.map((name) => [name, SCALE_TRANSFORMS[name].code])),
  step: STEP_KIND,
});
/** @type {(value: unknown) => value is import("../publicTypes.js").AnimatedChannel} */
export const isAnimate = (value) => Boolean(value?.__hmplotAnimate);
/**
 * Check an animate()/tween() duration and easing; `what` names the operator in messages.
 * The GPU and CPU easing tables are the same list, so an unknown name is an error rather
 * than a silent fallback.
 */
export function checkTiming(what, { duration, easing } = {}) {
  if (duration !== undefined && !(typeof duration === "number" && Number.isFinite(duration) && duration >= 0))
    throw Error(`${what} duration must be a finite, nonnegative number of milliseconds.`);
  if (easing !== undefined && !easings.includes(easing))
    throw Error(`Unknown easing ${JSON.stringify(easing)}; use ${easings.join(", ")}.`);
}
/**
 * Mark a channel value as animated: `animate(value, {duration, easing, enter, exit})`.
 * The consuming mark interpolates that channel per row in scale space, using `enter` as
 * the value new rows start from and `exit` as the value departing rows move to. Numeric
 * column expressions read the new data for enter and the previous data for exit; missing
 * endpoints keep the channel value. It must be
 * the outermost operator on a channel (it is not an expression), and durations are in
 * milliseconds like animationDuration.
 */
export function animate(value, { duration, easing, enter, exit } = {}) {
  if (isAnimate(value)) throw Error("animate() cannot wrap another animate().");
  checkTiming("animate", { duration, easing });
  return Object.freeze({ __hmplotAnimate: true, value, duration, easing, enter, exit });
}
export function ensureAnimation(options) {
  ensureAnimationTiming(options, "animation", "animationDuration", "animationEasing");
}
export function ensureBoundsAnimation(options) {
  ensureAnimationTiming(options, "animateBounds", "boundsDuration", "boundsEasing");
}
function ensureAnimationTiming(options, enabled, duration, easing) {
  options.ensure(enabled, new BooleanType({ defaultValue: false }));
  options.ensure(
    duration,
    new ScalarType({
      defaultValue: 300,
      min: 0,
      step: 10,
      transform: (v) => {
        if (!Number.isFinite(v) || v < 0)
          throw Error(`${duration} must be finite and nonnegative; pass milliseconds >= 0.`);
        return v;
      },
    }),
  );
  options.ensure(
    easing,
    new SelectType({ defaultValue: "cubic-in-out", options: easings }),
  );
}
const clocks = new WeakMap();
const holds = new WeakMap();
/** Updates and exports may overlap or finish out of order. Each owns one hold;
 * restoring a saved boolean can otherwise leave the clock held permanently.
 * @param {import("./internalTypes.js").ViewServices | undefined} view The view whose clock it holds.
 */
export function holdAnimation(view) {
  if (!view) return () => {};
  const { clock } = view;
  let state = holds.get(view);
  if (!state) {
    state = { count: 0, previous: clock.held };
    holds.set(view, state);
  }
  state.count++;
  clock.held = true;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state.count === 0) {
      clock.held = state.previous;
      holds.delete(view);
      if (view.renderer) clocks.get(view.renderer)?.schedule();
    }
  };
}
export function animationClock(renderer) {
  if (!clocks.has(renderer)) clocks.set(renderer, new AnimationClock(renderer));
  return clocks.get(renderer);
}
/**
 * Make `renderer`'s clock its view's (its owner, viewCore, does as it creates the renderer,
 * before anything reads the clock): the clock keeps the view's clock scope's time, reads the
 * view's holds and lifecycle (an update hold, the frames drawn), and shows its errors, and its
 * procedural tracks', in the view's diagnostics.
 * @param {object} renderer
 * @param {import("./internalTypes.js").ViewServices} view
 */
export function attachClockView(renderer, view) {
  if (!clocks.has(renderer)) clocks.set(renderer, new AnimationClock(renderer, view));
  return clocks.get(renderer);
}
export function animationEnabled(owner) {
  return !!owner?.options?.get("animation") && !owner?.manualAnimation;
}
export const animatedOptions = new Set([
  "opacity",
  "rotation",
  "zScale",
  "displayScale",
  "outlineWidth",
  "outlineOpacity",
  "outlineColor",
  "dashSize",
  "gapSize",
  "fillColor",
]);
const blendCode = `
struct P {count:u32,progress:f32,finish:u32,pad:u32}
@group(0) @binding(0) var<storage,read> a:array<f32>;
@group(0) @binding(1) var<storage,read> b:array<f32>;
@group(0) @binding(2) var<storage,read_write> out:array<f32>;
@group(0) @binding(3) var<uniform> p:P;
@group(0) @binding(4) var<storage,read_write> mismatch:atomic<u32>;
fn finite(x:f32)->bool{return abs(x)<=3.402823e38;}
@compute @workgroup_size(256) fn check(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i<p.count && finite(a[i])!=finite(b[i])){atomicOr(&mismatch,1u);}}
@compute @workgroup_size(256) fn blend(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.count){return;}if(p.finish!=0u||atomicLoad(&mismatch)!=0u||!finite(a[i])||!finite(b[i])){out[i]=b[i];}else if(p.pad==4u && i%4u!=3u){let alpha=mix(a[i-i%4u+3u],b[i-i%4u+3u],p.progress);out[i]=select(0.,mix(a[i]*a[i-i%4u+3u],b[i]*b[i-i%4u+3u],p.progress)/max(alpha,1e-12),alpha>0.);}else{out[i]=mix(a[i],b[i],p.progress);}}
`;
/**
 * One clock per renderer (View), timed by its clock scope (TODO 50; utils/clockScope.js): `time`
 * is the scope's animation timebase in milliseconds, shared by every View in it. @time reads
 * it, and every transition is stamped and blended with it, so CPU progress and the GPU's per-row
 * progress agree by construction. The scope moves it once per displayed frame, by the frame
 * delta. Explicit holds (exports, holdAnimations) pause time; preparation and uploads defer
 * applying that time until a consistent frame is ready. Idle and frozen scopes do not advance.
 * A view without a scope (unit tests) gets one of its own; a renderer outside every view (unit
 * tests) too, and it is never held and has drawn no frame. Per-track bookkeeping lives in
 * `states`, never on the track objects, which own their own fields (a RowTransition's GPU
 * buffers among them).
 */
class AnimationClock {
  /**
   * @param {any} renderer
   * @param {import("./internalTypes.js").ViewServices} [view] Its view (attachClockView).
   */
  constructor(renderer, view = undefined) {
    this.renderer = renderer;
    this.view = view;
    this.ownScope = !view?.clock.scope;
    this.scope = this.ownScope ? new ClockScope() : view.clock.scope;
    if (view) view.clock.scope = this.scope;
    this.scope.clocks.add(this);
    this.tracks = new Set();
    this.states = new WeakMap();
    this.owners = new Set();
    this.waiters = [];
    this.frame = 0;
    this.busy = null;
    this.disposed = false;
  }
  /** Its view's diagnostics, where it shows its errors. */
  get diagnostics() {
    return this.view?.diagnostics;
  }
  get time() {
    return this.scope.time;
  }
  set time(value) {
    this.scope.time = value;
  }
  get reduced() {
    return this.scope.reduced;
  }
  /** Whether the timebase moves with the frames: not while frozen or under reduced motion. */
  advancing() {
    return this.scope.advancing();
  }
  /**
   * Whether this View defers applying its scope's time: while a run is in flight, while any mark's field
   * write is queued (so marks updated together start their transitions on the same frame; for
   * the whole view, not per mark: a write is pending only until it is queued, and a transition
   * beside a mark streaming 50,000 rows a frame was never held, TODO 32.11), and during exports.
   */
  holds() {
    return !!this.busy || [...this.owners].some((o) => o.manager?.pendingUpdates) ||
      !!this.view?.lifecycle.renderHeld || this.paused();
  }
  /** An explicit pause excludes elapsed time; pending work merely delays its application. */
  paused() {
    return !!this.view?.clock.held;
  }
  register(owner) {
    this.owners.add(owner);
    return () => {
      this.owners.delete(owner);
      const state = markAnimation(owner);
      const flags = state.flags;
      if (flags)
        this.renderer.backend.device.queue
          .onSubmittedWorkDone()
          .then(() => flags.destroy());
      for (const t of [...this.tracks])
        if (t.owner === owner) {
          this.remove(t);
          t.dispose?.();
        }
      this.resolve();
    };
  }
  active(owner) {
    const state = markAnimation(owner);
    return (
      animationEnabled(owner) &&
      state.ready &&
      !state.snap &&
      // A mark over a live view (TODO 28) gets new data every frame: the implicit transition
      // would restart each time, so it snaps; explicit animate()/tween() still run.
      !state.live &&
      owner.options.get("animationDuration") > 0 &&
      !this.reduced
    );
  }
  state(track) {
    let state = this.states.get(track);
    if (!state) this.states.set(track, (state = {}));
    return state;
  }
  /**
   * Start (or restart) a track at the current time. Per-row transitions keep their earlier
   * rows moving, so a retarget never shortens the time the track stays pending.
   */
  add(track) {
    const time = this.time, previous = this.tracks.has(track) ? this.states.get(track) : null;
    const duration = Math.max(0, Number(track.customDuration ?? track.owner.options?.get("animationDuration") ?? 0));
    const state = {
      start: time, duration, applied: false, suspended: false,
      easing: track.customEasing ?? track.owner.options?.get("animationEasing"),
    };
    if (track.perRow && previous && previous.start + previous.duration > time + duration) {
      state.start = previous.start;
      state.duration = previous.duration;
    }
    this.tracks.add(track);
    this.states.set(track, state);
    this.schedule();
  }
  /** Keep a track pending but leave it alone while it takes a new target. */
  suspend(track) {
    if (this.tracks.has(track)) this.state(track).suspended = true;
  }
  resume(track) {
    if (!this.tracks.has(track)) return;
    this.state(track).suspended = false;
    this.schedule();
  }
  remove(track) {
    this.tracks.delete(track);
    this.states.delete(track);
    this.resolve();
  }
  /** Tracks that finish (procedural @time tracks run for as long as their mark exists). */
  pending(owner) {
    for (const t of this.tracks)
      if (!t.procedural && (owner === undefined || t.owner === owner)) return true;
    return false;
  }
  /** A started track that has not drawn its first frame yet; rendering waits for it. */
  unapplied() {
    for (const t of this.tracks) {
      const state = this.states.get(t);
      if (!t.procedural && state && !state.applied && !state.suspended) return true;
    }
    return false;
  }
  /** A track's progress (0 to 1) at the current time, or null when it is not running. */
  progress(track) {
    const state = this.tracks.has(track) ? this.states.get(track) : null;
    if (!state) return null;
    return state.duration > 0 ? Math.min(1, Math.max(0, (this.time - state.start) / state.duration)) : 1;
  }
  /** Ask the scope for a frame. */
  schedule() {
    if (!this.disposed) this.scope.schedule();
  }
  resolve() {
    const frozen = this.scope.frozen;
    this.waiters = this.waiters.filter((waiter) => {
      const done = (waiter.deadline !== undefined && this.time >= waiter.deadline) ||
        (!this.busy && (!this.pending(waiter.owner) || (waiter.owner === undefined && frozen)));
      if (done) waiter.resolve();
      return !done;
    });
  }
  /**
   * Resolves when the tracks settle: all of them, or one owner's (a mark retiring its
   * departing rows waits on its own transitions only). `cap`, in clock milliseconds, bounds
   * the wait; it counts animation time, not wall time, so it never fires while the clock is
   * frozen or held. The View-wide wait also resolves while the clock is frozen, since nothing
   * moves until it resumes.
   */
  finished({ owner, cap } = {}) {
    return new Promise((resolve) => {
      this.waiters.push({ owner, deadline: cap === undefined ? undefined : this.time + cap, resolve });
      this.resolve();
    });
  }
  /** Whether a track runs: explicit animate/tween ignore the mark's animation switch. */
  running(track) {
    if (this.reduced) return false;
    if (track.explicit) return !track.owner.isDisposed;
    return this.active(track.owner);
  }
  /** The scope's frame at `frameTime` (the scope's loop calls it; unit tests drive it). */
  advance(frameTime, drawn = false) {
    return this.scope.frame(frameTime, drawn);
  }
  /**
   * The render loop drew a frame. Step procedural channels right away, so their upload lands
   * before the next frame instead of holding it back.
   */
  drawn() {
    if (this.disposed || this.busy || !this.advancing()) return;
    for (const t of this.tracks)
      if (t.procedural) {
        queueMicrotask(() => this.scope.frame(performance.now(), true));
        return;
      }
  }
  /** Apply every track at the current time now (setAnimationTime), then resume the loop. */
  async step() {
    while (this.busy) await this.busy;
    if (this.tracks.size) await this.run({ force: true });
    else this.resolve();
  }
  /**
   * Draw every track at the current time. Procedural tracks step when the time moved and the
   * frame showing their previous step has been drawn: a step uploads fields, and the render
   * loop waits for uploads, so stepping every animation frame would starve rendering. A step
   * that wrote nothing (its changed() returned false: an interval between steps) holds nothing
   * back. A track with `drawTimeout` (a transform's: its run may draw nothing, having no marks
   * under it) steps anyway once that many milliseconds pass without a drawn frame.
   */
  async run({ force = false } = {}) {
    const list = [...this.tracks], time = this.time, procedural = [];
    const drawn = this.view?.lifecycle.completedFrame;
    if (this.view) this.view.clock.busy = true;
    this.busy = (async () => {
      const callbacks = new Set(), moved = new Set();
      for (const t of list) {
        if (!this.tracks.has(t)) continue;
        if (t.owner.isDisposed) {
          this.remove(t);
          continue;
        }
        const state = this.state(t);
        if (t.procedural) {
          const stale = t.drawTimeout !== undefined && performance.now() - (state.steppedAt ?? 0) > t.drawTimeout;
          const shown = force || !state.stepped || state.wrote === false || drawn !== state.drawn || stale;
          if (state.time !== time && shown) {
            state.time = time;
            state.drawn = drawn;
            state.steppedAt = performance.now();
            state.stepped = true;
            procedural.push(t);
          }
          continue;
        }
        if (state.suspended) continue;
        // A keyed update's staging frame (namedMark, keyedLifecycle) turns the mark's animation
        // off while it writes the union of old and new rows. Its transitions hold where they
        // are until the target frame retargets them; finishing them here would jump every
        // moving row to its old target first. Rows keep their start times, so nothing is lost.
        if (markAnimation(t.owner).staging) continue;
        const progress = state.duration > 0 ? (time - state.start) / state.duration : 1;
        const done = !this.running(t) || progress >= 1;
        // A clock that did not move leaves an already drawn transition alone.
        if (!done && state.applied && state.progress === progress) continue;
        state.applied = true;
        state.progress = progress;
        t.apply(ease(done ? 1 : Math.max(0, progress), state.easing), done);
        moved.add(t.owner);
        markAnimation(t.owner).version++;
        // Procedural steps write fields, and field uploads wait for this busy block, so
        // they run after it (see below).
        if (t.changed) callbacks.add(t.changed);
        if (done) {
          this.tracks.delete(t);
          this.states.delete(t);
          t.complete?.();
        }
      }
      // Connections (Stage 15): a connector re-reads its moved endpoints' rows now, after their
      // blend was submitted, so it draws them at this same clock time (connectionGather.js).
      const followers = new Set();
      for (const owner of moved) for (const follow of owner.connectionFollowers ?? []) followers.add(follow);
      for (const follow of followers) follow();
      for (const f of callbacks) await f();
      // No wait for the GPU queue here (TODO 32.11): a 1M-point transition, drawn slower than
      // the display refreshes, showed the same frames and end time without it (the browser
      // paces the frames), and field uploads wait for this block.
      if (moved.size) for (const o of this.owners) o.invalidate();
      if (moved.size || procedural.length) this.frame++;
      // A frame that draws clears the clock's error (TODO 32.5: owner-scoped, not the plot's).
      this.diagnostics?.report(this, "");
    })()
      .catch((e) => {
        this.diagnostics?.report(this, e.message);
        console.error("Animation:", e);
        for (const t of [...this.tracks]) if (!t.procedural) this.remove(t);
      })
      .finally(() => {
        if (this.view) this.view.clock.busy = false;
        this.busy = null;
        this.resolve();
        // A frozen or reduced-motion clock draws once and waits: add(), setAnimationTime
        // and a reduced-motion change wake it again.
        if (this.tracks.size && this.advancing()) this.schedule();
      });
    await this.busy;
    for (const t of procedural)
      if (this.tracks.has(t) && !t.owner.isDisposed) {
        const wrote = await t.changed?.().then(
          (value) => (this.diagnostics?.report(t, ""), value),
          (e) => this.diagnostics?.report(t, e.message),
        );
        const state = this.states.get(t);
        if (state) state.wrote = wrote !== false;
      }
  }
  pipeline(entry) {
    const device = this.renderer.backend.device;
    this.pipelines ??= new Map();
    if (!this.pipelines.has(entry))
      this.pipelines.set(
        entry,
        device.createComputePipeline({
          layout: "auto",
          compute: {
            module: device.createShaderModule({ code: blendCode }),
            entryPoint: entry,
          },
        }),
      );
    return this.pipelines.get(entry);
  }
  dispose() {
    this.disposed = true;
    this.scope.clocks.delete(this);
    if (this.ownScope) this.scope.dispose();
    for (const t of this.tracks) t.dispose?.();
    this.tracks.clear();
    this.resolve();
  }
}
export class BufferTransition {
  constructor(renderer, owner, output, count, changed, premultiplied = false) {
    this.premultiplied = premultiplied;
    this.renderer = renderer;
    this.owner = owner;
    this.output = output;
    this.count = count;
    this.changed = changed;
    this.clock = animationClock(renderer);
    const d = renderer.backend.device,
      bytes = Math.max(16, count * 4);
    if (bytes > storageLimit(d))
      throw animationLimit(owner, count, storageLimit(d));
    this.sourceBuffer = d.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.targetBuffer = d.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.paramsBuffer = d.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // dispose() releases exactly these, whatever the properties hold by then.
    this.owned = [this.sourceBuffer, this.targetBuffer, this.paramsBuffer];
    const state = markAnimation(owner);
    state.flags ??= d.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.flags = state.flags;
    this.groups = new Map();
  }
  async prepare(upload) {
    await this.clock.busy;
    this.clock.suspend(this);
    const d = this.renderer.backend.device,
      e = d.createCommandEncoder();
    e.copyBufferToBuffer(this.output, 0, this.sourceBuffer, 0, this.count * 4);
    d.queue.submit([e.finish()]);
    await upload(this.targetBuffer);
    const state = markAnimation(this.owner);
    if (state.flagsBatch !== this.owner.manager.animationBatch) {
      d.queue.writeBuffer(this.flags, 0, new Uint32Array([0]));
      state.flagsBatch = this.owner.manager.animationBatch;
    }
    this.dispatch("check", 0, false);
    this.clock.add(this);
  }
  dispatch(entry, progress, finish) {
    const d = this.renderer.backend.device,
      pipeline = this.clock.pipeline(entry),
      raw = new ArrayBuffer(16);
    new Uint32Array(raw)[0] = this.count;
    new Float32Array(raw)[1] = progress;
    new Uint32Array(raw)[2] = finish ? 1 : 0;
    new Uint32Array(raw)[3] = this.premultiplied ? 4 : 0;
    d.queue.writeBuffer(this.paramsBuffer, 0, raw);
    if (!this.groups.has(entry))
      this.groups.set(
        entry,
        d.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            this.sourceBuffer,
            this.targetBuffer,
            this.output,
            this.paramsBuffer,
            this.flags,
          ]
            .map((buffer, binding) => ({ binding, resource: { buffer } }))
            .filter((e) => entry !== "check" || e.binding !== 2),
        }),
      );
    const encoder = d.createCommandEncoder(),
      pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.groups.get(entry));
    pass.dispatchWorkgroups(Math.ceil(this.count / 256));
    pass.end();
    d.queue.submit([encoder.finish()]);
  }
  apply(t, done) {
    this.dispatch("blend", t, done);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clock.remove(this);
    const resources = this.owned.splice(0);
    this.renderer.backend.device.queue
      .onSubmittedWorkDone()
      .then(() => resources.forEach((b) => b.destroy()));
  }
}
/**
 * Per-row transitions. Every row keeps its own from/to/start, so rows retarget
 * independently ("continue from the current value, restart the duration") and rows whose
 * value did not change never move. Interpolation happens in scale space per component:
 * a scale transform's code (utils/scaleTransforms.js; with its symlog constant), or step
 * (categorical: switch at t = 0.5). An endpoint outside the transform's domain is missing, as
 * a non-finite one is: the row takes its target at once. Each component (x, y, z of a position) has its own
 * duration, easing and mode (0 snaps, 1 animates, 2 animates but a row whose value changed
 * arrives at once: a live drag, TODO 38 decision 7). Nothing here is read back; the live
 * storage buffer is the only output, so material bindings never change.
 */
const rowBlendCode = `
struct P {count:u32,now:f32,stride:u32,finish:u32,kinds:vec4u,durations:vec4f,easings:vec4u,modes:vec4u,constants:vec4f}
@group(0) @binding(0) var<storage,read_write> from_:array<f32>;
@group(0) @binding(1) var<storage,read_write> to_:array<f32>;
@group(0) @binding(2) var<storage,read_write> start:array<f32>;
@group(0) @binding(3) var<storage,read> incoming:array<f32>;
@group(0) @binding(4) var<storage,read_write> out:array<f32>;
@group(0) @binding(5) var<uniform> p:P;
fn finite(x:f32)->bool{return abs(x)<=3.402823e38;}
fn ease(t:f32,k:u32)->f32{
  switch k {
    case 0u {return t;}
    case 1u {return t*t;}
    case 2u {return t*(2.-t);}
    case 3u {return select(1.-pow(-2.*t+2.,2.)/2.,2.*t*t,t<.5);}
    case 4u {return t*t*t;}
    case 5u {return 1.-pow(1.-t,3.);}
    case 7u {return (1.-cos(3.14159265*t))/2.;}
    default {return select(1.-pow(-2.*t+2.,3.)/2.,4.*t*t*t,t<.5);}
  }
}
${scaleTransformWgsl("blend")}
@compute @workgroup_size(256) fn init(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.count){return;}from_[i]=out[i];to_[i]=out[i];start[i]=-1e30;}
@compute @workgroup_size(256) fn retarget(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=p.count){return;}
  let n=incoming[i];
  if(p.modes[i%p.stride]==0u){from_[i]=n;to_[i]=n;out[i]=n;start[i]=-1e30;return;}
  let t=to_[i];
  let same=(n==t)||(!finite(n)&&!finite(t));
  if(!same&&p.modes[i%p.stride]==2u){from_[i]=n;to_[i]=n;out[i]=n;start[i]=-1e30;return;}
  if(!same){from_[i]=out[i];to_[i]=n;start[i]=p.now;}
}
@compute @workgroup_size(256) fn snap(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.count){return;}let n=incoming[i];from_[i]=n;to_[i]=n;out[i]=n;start[i]=-1e30;}
@compute @workgroup_size(256) fn blend(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=p.count){return;}
  let a=from_[i];let b=to_[i];
  if(p.finish!=0u||!finite(a)||!finite(b)){out[i]=b;return;}
  let c=i%p.stride;let k=p.kinds[c];let d=p.durations[c];
  let t=select(ease(clamp((p.now-start[i])/max(d,1e-6),0.,1.),p.easings[c]),1.,d<=0.);
  if(k==${STEP_KIND}u){out[i]=select(a,b,t>=.5);return;}
  if(!blendValid(a,k)||!blendValid(b,k)){out[i]=b;return;}
  let s=p.constants[c];
  out[i]=blendInverse(mix(blendForward(a,k,s),blendForward(b,k,s),t),k,s);
}
`;
export const ROW_BLEND_SOURCE = rowBlendCode;
/**
 * Keyed re-ordering of the per-row state: target row r takes source row rows[r]; a row with
 * no source (-1) takes the incoming value (mode 0) or rests (mode 1, for start times).
 */
const rowGatherCode = `
struct G {count:u32,stride:u32,oldCount:u32,mode:u32}
@group(0) @binding(0) var<storage,read> source_:array<f32>;
@group(0) @binding(1) var<storage,read_write> target_:array<f32>;
@group(0) @binding(2) var<storage,read> rows:array<i32>;
@group(0) @binding(3) var<storage,read> incoming:array<f32>;
@group(0) @binding(4) var<uniform> g:G;
@compute @workgroup_size(256) fn gather(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=g.count){return;}
  let j=rows[i/g.stride];
  let s=u32(max(j,0))*g.stride+i%g.stride;
  if(j>=0&&s<g.oldCount){target_[i]=source_[s];}else{target_[i]=select(incoming[i],-1e30,g.mode==1u);}
}
`;
const rowLayouts = new WeakMap();
function rowPipelines(device) {
  if (!rowLayouts.has(device)) {
    const layout = device.createBindGroupLayout({
      entries: [0, 1, 2, 3, 4, 5].map((binding) => ({
        binding, visibility: GPUShaderStage.COMPUTE,
        buffer: { type: binding === 3 ? "read-only-storage" : binding === 5 ? "uniform" : "storage" },
      })),
    });
    const module = device.createShaderModule({ code: rowBlendCode });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipelines = Object.fromEntries(["init", "retarget", "snap", "blend"].map((entry) => [
      entry, device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: entry } }),
    ]));
    const gatherLayout = device.createBindGroupLayout({
      entries: [0, 1, 2, 3, 4].map((binding) => ({
        binding, visibility: GPUShaderStage.COMPUTE,
        buffer: { type: binding === 1 ? "storage" : binding === 4 ? "uniform" : "read-only-storage" },
      })),
    });
    const gather = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [gatherLayout] }),
      compute: { module: device.createShaderModule({ code: rowGatherCode }), entryPoint: "gather" },
    });
    rowLayouts.set(device, { layout, pipelines, gatherLayout, gather });
  }
  return rowLayouts.get(device);
}
/** CPU reference of the shader's blend, for tests and for uniform values. */
export function blendValue(from, to, t, kind, easing = "cubic-in-out", constant = DEFAULT_TRANSFORM_CONSTANT) {
  return mixValue(from, to, ease(t, easing), kind, constant);
}
/** The shader's per-kind mix at an already eased progress `p`. */
export function mixValue(from, to, p, kind = TRANSFORM_KINDS.linear, constant = DEFAULT_TRANSFORM_CONSTANT) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return to;
  if (kind === TRANSFORM_KINDS.step) return p >= 0.5 ? to : from;
  const name = transformName(kind);
  // An endpoint outside the transform's domain is missing (TODO 39.1): take the target.
  if (!inTransformDomain(name, from) || !inTransformDomain(name, to)) return to;
  const a = transformForward(name, from, constant), b = transformForward(name, to, constant);
  return transformInverse(name, a + (b - a) * p, constant);
}
/** The easing's index in the WGSL table; unknown names match the CPU default. */
const easingIndex = (name) => {
  const index = easings.indexOf(name);
  return index < 0 ? easings.indexOf("cubic-in-out") : index;
};
const STORAGE = () => GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
/** Largest single storage binding the device accepts, in bytes. */
export function storageLimit(device) {
  return Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize);
}
/** The error for `count` values too many to animate in `limit` bytes (a state buffer each). */
function animationLimit(owner, count, limit) {
  return limitError("animation", {
    component: owner?.componentName ?? owner?.constructor?.componentName,
    count,
    limit: Math.floor(limit / 4),
  });
}
export class RowTransition {
  /**
   * spec: {stride, kinds: [k0..k3], components: [{mode, duration, easing}, ...] (one per
   * component, 4 entries), explicit}. `count` is in floats (rows * stride).
   */
  constructor(renderer, owner, output, count, changed, spec) {
    this.renderer = renderer;
    this.owner = owner;
    this.output = output;
    this.changed = changed;
    this.clock = animationClock(renderer);
    this.device = renderer.backend.device;
    this.perRow = true;
    this.count = count;
    this.capacity = 0;
    // Every buffer this transition created and has not released; dispose() frees these.
    this.owned = [];
    this.paramsBuffer = this.create(96, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.setSpec(spec);
    this.allocate(count);
  }
  create(size, usage) {
    const buffer = this.device.createBuffer({ size, usage });
    this.owned.push(buffer);
    return buffer;
  }
  /** Release buffers after the work already submitted (which may read them) completes. */
  release(buffers) {
    if (!buffers.length) return;
    this.owned = this.owned.filter((buffer) => !buffers.includes(buffer));
    this.device.queue.onSubmittedWorkDone().then(() => buffers.forEach((buffer) => buffer.destroy()));
  }
  /**
   * Grow-only state buffers, so a row-count change inside the capacity reuses them. Returns
   * the replaced buffers; the caller releases them once its commands are submitted.
   */
  allocate(count) {
    const limit = storageLimit(this.device);
    if (count * 4 > limit) throw animationLimit(this.owner, count, limit);
    const capacity = Math.max(count, Math.min(Math.floor(limit / 4), Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, count))))));
    const replaced = [this.fromBuffer, this.toBuffer, this.startBuffer, this.incomingBuffer].filter(Boolean);
    this.fromBuffer = this.create(capacity * 4, STORAGE());
    this.toBuffer = this.create(capacity * 4, STORAGE());
    this.startBuffer = this.create(capacity * 4, STORAGE());
    this.incomingBuffer = this.create(capacity * 4, STORAGE());
    this.capacity = capacity;
    this.group = this.device.createBindGroup({
      layout: rowPipelines(this.device).layout,
      entries: [this.fromBuffer, this.toBuffer, this.startBuffer, this.incomingBuffer, this.output, this.paramsBuffer]
        .map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    this.initialized = false;
    return replaced;
  }
  setSpec(spec) {
    this.spec = spec;
    this.stride = Math.max(1, spec.stride ?? 1);
    this.explicit = !!spec.explicit;
    const moving = (spec.components ?? []).filter((component) => component?.mode);
    // The CPU only decides when the track is done; the GPU eases each component itself.
    this.customDuration = Math.max(0, ...moving.map((component) => component.duration ?? 0));
    this.customEasing = "linear";
  }
  /** Take a new target. `upload(buffer)` copies the incoming values; snap skips the motion. */
  async prepare(upload, { snap = false, spec, count = this.count } = {}) {
    if (spec) this.setSpec(spec);
    await this.clock.busy;
    this.clock.suspend(this);
    let replaced = [];
    try {
      if (count > this.capacity) replaced = this.allocate(count);
      if (count !== this.count) {
        this.count = count;
        this.initialized = false;
      }
      if (!this.initialized && !snap) this.dispatch("init", false);
      await upload(this.incomingBuffer);
      this.dispatch(snap ? "snap" : "retarget", false);
      // Retargeting can follow a live geometry publication between clock ticks. Publish
      // every row's current value now, including unchanged targets and zero durations,
      // so drawing need not wait for another tick to apply this newly registered track.
      if (!snap) this.dispatch("blend", false);
      this.initialized = true;
    } catch (error) {
      this.clock.remove(this);
      throw error;
    } finally {
      this.release(replaced);
    }
    if (snap) {
      this.clock.remove(this);
      await this.changed?.();
    } else {
      this.clock.add(this);
      this.clock.state(this).applied = true;
    }
  }
  /**
   * Re-order the per-row state for a keyed update: row r continues old row rows[r]'s
   * transition (current value, target, start time), so a row that moves in the table keeps
   * moving on screen; rows with rows[r] = -1 are new and rest at their incoming value.
   * `rows` is an Int32Array with one entry per new row; `count` is in floats.
   */
  /**
   * Re-order the per-row state for `count` incoming values (the gather above): `rows` is an
   * Int32Array, or an int32 device array (a padded mark's snap index, TODO 32.12), copied on the
   * GPU. Consumes neither.
   */
  async reindex(rows, upload, count) {
    const d = this.device, { gather, gatherLayout } = rowPipelines(d);
    const deviceRows = rows instanceof JaxArray ? await rows.ref.gpuBuffer() : null;
    const rowBytes = deviceRows ? rows.size * 4 : rows.byteLength;
    await this.clock.busy;
    const inFlight = this.clock.tracks.has(this);
    this.clock.suspend(this);
    const oldCount = this.count, scratch = [], replaced = [];
    try {
      if (!this.initialized) this.dispatch("init", false);
      const sources = [this.output, this.fromBuffer, this.toBuffer, this.startBuffer];
      if (count > this.capacity) replaced.push(...this.allocate(count));
      await upload(this.incomingBuffer);
      const rowBuffer = d.createBuffer({ size: Math.max(16, rowBytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const copy = d.createBuffer({ size: Math.max(16, oldCount * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const params = [0, 1].map((mode) => {
        const buffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        d.queue.writeBuffer(buffer, 0, new Uint32Array([count, this.stride, oldCount, mode]));
        return buffer;
      });
      scratch.push(rowBuffer, copy, ...params);
      if (!deviceRows) d.queue.writeBuffer(rowBuffer, 0, rows);
      const targets = [this.output, this.fromBuffer, this.toBuffer, this.startBuffer];
      const encoder = d.createCommandEncoder();
      if (deviceRows && rowBytes) encoder.copyBufferToBuffer(deviceRows, 0, rowBuffer, 0, rowBytes);
      targets.forEach((target, k) => {
        // Copy first: the live output (and the state, when it did not grow) is both the
        // source and the target of its gather.
        if (oldCount) encoder.copyBufferToBuffer(sources[k], 0, copy, 0, oldCount * 4);
        const pass = encoder.beginComputePass();
        pass.setPipeline(gather);
        pass.setBindGroup(0, d.createBindGroup({
          layout: gatherLayout,
          entries: [copy, target, rowBuffer, this.incomingBuffer, params[k === 3 ? 1 : 0]]
            .map((buffer, binding) => ({ binding, resource: { buffer } })),
        }));
        pass.dispatchWorkgroups(Math.ceil(count / 256));
        pass.end();
      });
      d.queue.submit([encoder.finish()]);
      this.count = count;
      this.initialized = true;
    } catch (error) {
      this.clock.remove(this);
      throw error;
    } finally {
      this.release(replaced);
      if (scratch.length) d.queue.onSubmittedWorkDone().then(() => scratch.forEach((buffer) => buffer.destroy()));
    }
    if (inFlight) this.clock.resume(this);
    else this.clock.remove(this);
    await this.changed?.();
  }
  dispatch(entry, finish) {
    const d = this.device, { pipelines } = rowPipelines(d);
    const raw = new ArrayBuffer(96), u = new Uint32Array(raw), f = new Float32Array(raw);
    u[0] = this.count; f[1] = this.clock.time; u[2] = this.stride; u[3] = finish ? 1 : 0;
    const kinds = this.spec.kinds ?? [0, 0, 0, 0], components = this.spec.components ?? [];
    for (let c = 0; c < 4; c++) {
      const component = components[c] ?? components[0] ?? {};
      u[4 + c] = kinds[c] ?? 0;
      f[8 + c] = component.duration ?? 0;
      u[12 + c] = easingIndex(component.easing);
      // 0 snaps, 1 animates, 2 animates but a row whose value changed arrives at once.
      u[16 + c] = component.mode ?? 0;
      f[20 + c] = this.spec.constants?.[c] ?? DEFAULT_TRANSFORM_CONSTANT;
    }
    d.queue.writeBuffer(this.paramsBuffer, 0, raw);
    const encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(pipelines[entry]);
    pass.setBindGroup(0, this.group);
    pass.dispatchWorkgroups(Math.ceil(this.count / 256));
    pass.end();
    d.queue.submit([encoder.finish()]);
  }
  apply(t, done) {
    this.dispatch("blend", done);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clock.remove(this);
    const resources = this.owned.splice(0);
    this.device.queue.onSubmittedWorkDone().then(() => resources.forEach((b) => b.destroy()));
  }
}
/**
 * Animate a uniform (one value for the whole mark). An animate() spec on the channel
 * (markAnimation(owner).specs, keyed by field or option name) runs regardless of the mark's
 * animation switch, with its own duration, easing and scale-space kind; otherwise the
 * mark's animation settings apply.
 */
/** @param {import("./effectiveFieldBinding.js").FieldAnimationTag | null} [policy] */
export function uniformTransition(owner, key, node, next, policy = undefined) {
  const clock = animationClock(owner.renderer);
  const state = markAnimation(owner);
  let track = state.uniforms.get(key);
  // Uniforms have no row order to stage. Hold their displayed value until the target
  // frame arrives, just as the keyed buffer gather retains existing rows' current values.
  if (policy?.staging) return;
  const clone = (v) => (v?.clone ? v.clone() : Array.isArray(v) ? [...v] : v);
  // Field writes carry the policy captured when queued; options read their current policy.
  const spec = policy == null ? state.specs?.[key.replace(/^field:/, "")] : policy.spec;
  const explicit = !!spec?.explicit;
  const component = spec?.components?.[0];
  const run = !(policy == null ? state.schemeReset : policy.schemeReset) && !component?.suppressed &&
    (explicit ? state.ready && component?.duration > 0 && clock.running({ explicit: true, owner }) : clock.active(owner));
  const same = (a, b) => Object.is(a, b) ||
    Boolean(a?.equals && b && a.equals(b)) ||
    (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => same(value, b[i])));
  // Geometry updates often publish a new scalar wrapper for the same target. Keep the
  // original schedule and its displayed value; changed targets still retarget from it.
  if (run && track && clock.tracks.has(track) && same(track.target, next)) return;
  if (track) clock.remove(track);
  if (!run || policy?.arrive || node.value == null || same(node.value, next)) {
    node.value = clone(next);
    return;
  }
  const from = clone(node.value),
    target = clone(next),
    kind = spec?.kinds?.[0] ?? TRANSFORM_KINDS.linear,
    constant = spec?.constants?.[0] ?? DEFAULT_TRANSFORM_CONSTANT;
  track = {
    owner,
    target,
    explicit,
    customDuration: explicit ? component?.duration : undefined,
    customEasing: explicit ? component?.easing : undefined,
    apply(t) {
      // Publish the exact target at completion. Rounding in a + (b - a) can otherwise
      // make an inferred frame domain look like a manual override on the next update.
      if (t >= 1) { node.value = clone(target); return; }
      if (typeof from === "number") node.value = mixValue(from, target, t, kind, constant);
      else if (node.value?.copy && node.value?.lerp)
        node.value.copy(from).lerp(target, t);
      else if (Array.isArray(from))
        node.value = from.map((v, i) => v + (target[i] - v) * t);
      else node.value = target;
    },
  };
  state.uniforms.set(key, track);
  clock.add(track);
}

/** Numeric frame intervals share the marks' clock, including frozen exports and retargets.
 * Structural edits and direction reversals snap rather than passing through a zero span.
 * Initial preparation always arrives without a transition. */
export function createFrameAnimation(renderer, options, invalidate = () => {}) {
  // Reuse the shared clock without publishing mark-animation settings into the frame scope.
  const keys = { animation: "animateBounds", animationDuration: "boundsDuration", animationEasing: "boundsEasing" };
  const owner = { renderer, options: { get: key => options.get(keys[key] ?? key) }, invalidate };
  const clock = animationClock(renderer), unregister = clock.register(owner), targets = new Map(), displayed = new Map();
  const clear = key => {
    const state = markAnimation(owner), track = state.uniforms.get(key);
    if (track) clock.remove(track);
    state.uniforms.delete(key);
    targets.delete(key);
    displayed.delete(key);
  };
  let writing = false;
  const stop = options.on?.((_, key) => {
    // An inspector edit owns its value immediately; a pending prop transition must not
    // overwrite it on the next frame. Our own displayed writes keep their target intact.
    const value = options.get(key), previous = displayed.get(key);
    if (!writing && targets.has(key) &&
        !(Array.isArray(value) && previous?.every((v, i) => v === value[i]))) {
      clear(key);
      if (Array.isArray(value)) { targets.set(key, [...value]); displayed.set(key, [...value]); }
    }
  });
  return {
    set(key, bounds, snap = false) {
      const previous = targets.get(key), from = options.get(key);
      if (!snap && previous?.every((v, i) => v === bounds[i])) return;
      const state = markAnimation(owner);
      targets.set(key, [...bounds]);
      state.ready = previous !== undefined && (clock.view?.lifecycle.completedFrame ?? 0) > 0;
      state.snap = snap || !Array.isArray(from) ||
        ![...from, ...bounds].every(Number.isFinite) ||
        Math.sign(from[1] - from[0]) !== Math.sign(bounds[1] - bounds[0]);
      const node = {
        get value() { return options.get(key); },
        set value(value) {
          displayed.set(key, [...value]);
          writing = true;
          try { options.set(key, value); } finally { writing = false; }
        },
      };
      uniformTransition(owner, key, node, bounds);
      state.snap = false;
    },
    clear,
    target: key => targets.get(key),
    running: key => clock.tracks.has(markAnimation(owner).uniforms.get(key)),
    dispose() { owner.isDisposed = true; stop?.(); unregister(); targets.clear(); displayed.clear(); },
  };
}
