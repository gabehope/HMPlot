// @ts-check
import { getContext, setContext, onDestroy } from "svelte";

/** The scope coordinates these owners without accessing their tracks or state machines.
 * @typedef {{tracks: ReadonlySet<unknown>, holds(): boolean, paused(): boolean,
 * resolve(): void, run(): Promise<unknown>, step(): Promise<unknown>}} ScopeClock
 * @typedef {{active(): boolean, autoplay?: () => boolean, tick(dt: number): unknown}} ClockTicker
 */

/**
 * A clock scope (TODO 50): one time for every Plot under it, so their @time channels and
 * transitions stay in step, and the time source of its Playbacks and Simulates. A Python Scene,
 * the outermost InputContext, a standalone Facet and a Simulate define one when none exists
 * above them, else each Plot defines its own (provideClockScope). Nested InputContexts and
 * Templates reuse the clock above them.
 *
 * The scope owns the time, its freeze (setAnimationTime), and the frame loop: one
 * requestAnimationFrame tick per displayed frame while anything needs it, a transition or @time
 * reader in one of its views (each view's AnimationClock, which keeps its own tracks), or a
 * ticker (a playing Playback, a running Simulate). Ticker deltas are capped at 250 ms; transitions
 * and @time follow elapsed time, including preparation delays. Explicit holds (exports and
 * holdAnimations) pause that time. Pending work delays applying it, and the time stands
 * still while frozen or under reduced motion; tickers move with the frames except while held or
 * frozen (a Playback the reader pressed play on still plays under reduced motion; a ticker that
 * plays by itself, `autoplay()` true, waits, and setAnimationTime still moves it).
 */
export const CLOCK_SCOPE = Symbol("clock scope");
const DELTA_CAP = 250;

export class ClockScope {
  constructor() {
    this.time = 0;
    this.frozen = false;
    /** @type {Set<ScopeClock>} */
    this.clocks = new Set();
    /** @type {Set<ClockTicker>} */
    this.tickers = new Set();
    /** @type {number | null} */
    this.last = null;
    this.raf = 0;
    this.movedAfterDraw = false;
    this.disposed = false;
    this.media =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    this.wake = () => this.schedule();
    this.media?.addEventListener("change", this.wake);
  }
  get reduced() {
    return !!this.media?.matches;
  }
  /** Whether @time moves with the frames: not while frozen or under reduced motion. */
  advancing() {
    return !this.frozen && !this.reduced;
  }
  /** Held while any of its views holds its clock. */
  held() {
    for (const clock of this.clocks) if (clock.holds()) return true;
    return false;
  }
  /** Whether the next frame moves anything: a track while @time advances, or a ticker. */
  wanted() {
    if (this.frozen) return false;
    if (!this.reduced)
      for (const clock of this.clocks) if (clock.tracks.size) return true;
    for (const ticker of this.tickers) if (this.moves(ticker)) return true;
    return false;
  }
  /** Whether the frames move `ticker`: while active, and not on its own under reduced motion. */
  /** @param {ClockTicker} ticker */
  moves(ticker) {
    return ticker.active() && !(this.reduced && ticker.autoplay?.());
  }
  /**
   * A ticker moves with the scope's frames: `tick(dt)` while `active()`, with dt in
   * milliseconds (a step of setAnimationTime passes the whole step forward); one whose
   * `autoplay()` is true does not move with the frames under reduced motion. Returns the
   * unsubscribe.
   */
  /** @param {ClockTicker} ticker */
  subscribe(ticker) {
    this.tickers.add(ticker);
    this.schedule();
    return () => this.tickers.delete(ticker);
  }
  schedule() {
    if (!this.raf && !this.disposed)
      this.raf = requestAnimationFrame((time) => {
        this.raf = 0;
        this.frame(time);
      });
  }
  /**
   * Move the time to `frameTime` and draw every view's tracks there. The time moves once per
   * displayed frame (TODO 28): after a drawn frame (drawn: a view stepping its procedural
   * channels so their uploads land before the next frame; the first view of the scope to draw),
   * else at the animation frame, which then skips when a drawn frame already moved it. So every
   * @time reader in the scope sees one time per frame, and tickers move once per frame.
   */
  /** @param {number} frameTime @param {boolean} [drawn] */
  async frame(frameTime, drawn = false) {
    if (this.disposed) return;
    // One move per displayed frame for the whole scope: the first of its views to draw moves
    // it, and the others' drawn frames wait for the next one (their procedural steps run on it).
    if (drawn && this.movedAfterDraw) return;
    if (!drawn && this.movedAfterDraw) {
      this.movedAfterDraw = false;
      if (this.wanted()) this.schedule();
      return;
    }
    this.movedAfterDraw = drawn;
    if (this.held()) {
      // Exports and explicit pauses exclude elapsed time. Preparation waits preserve it:
      // the next consistent frame catches up, instead of stretching transition durations.
      if (
        this.frozen ||
        this.reduced ||
        [...this.clocks].some((clock) => clock.paused())
      )
        this.last = frameTime;
      this.schedule();
      return;
    }
    const tracked = [...this.clocks].filter((clock) => clock.tracks.size);
    const ticking = [...this.tickers].filter((ticker) => this.moves(ticker));
    if (!tracked.length && !ticking.length) {
      this.last = null;
      for (const clock of this.clocks) clock.resolve();
      return;
    }
    // A drawn frame's time (performance.now()) can be later than the next animation frame's.
    const elapsed = this.last == null ? 0 : Math.max(0, frameTime - this.last);
    const dt = Math.min(DELTA_CAP, elapsed);
    this.last = Math.max(this.last ?? frameTime, frameTime);
    // The time first: a reader a ticker's value re-runs (a transform reading a Playback and
    // @time) then takes this frame's time, and its @time step finds nothing new.
    if (this.advancing()) this.time += elapsed;
    if (!this.frozen) for (const ticker of ticking) ticker.tick(dt);
    await Promise.all(tracked.map((clock) => clock.run()));
    if (this.wanted()) this.schedule();
    else this.last = null;
  }
  /**
   * setAnimationTime: set the time (and freeze it, by default) for every view in the scope, and
   * move its tickers by the step forward (a Playback advances, a Simulate takes the steps due),
   * waiting for them. A step back moves only the time. null unfreezes.
   */
  /** @param {number | null | undefined} time @param {{freeze?: boolean}} [options] */
  async setTime(time, { freeze = true } = {}) {
    /** @type {unknown[]} */
    let work = [];
    if (time === null || time === undefined) this.frozen = false;
    else {
      const dt = time - this.time;
      this.time = time;
      this.frozen = freeze;
      if (dt > 0)
        work = [...this.tickers]
          .filter((ticker) => ticker.active())
          .map((ticker) => ticker.tick(dt));
    }
    await Promise.all(work);
    await Promise.all([...this.clocks].map((clock) => clock.step()));
    this.last = null;
    this.schedule();
  }
  dispose() {
    this.disposed = true;
    // Only a browser requests frames; a server render disposes a scope that never did.
    if (this.raf) cancelAnimationFrame(this.raf);
    this.media?.removeEventListener("change", this.wake);
    this.tickers.clear();
  }
}

/** The clock scope around the calling component (during its initialization), or null. */
/** @returns {ClockScope | null} */
export const clockScopeAbove = () =>
  getContext(/** @type {symbol} */ (CLOCK_SCOPE)) ?? null;

/**
 * The clock scope around the calling component, else a new one it provides to everything under
 * it and disposes with it (decision 3). Call during component initialization.
 */
export function provideClockScope() {
  const outer = clockScopeAbove();
  if (outer) return outer;
  const scope = new ClockScope();
  setContext(CLOCK_SCOPE, scope);
  onDestroy(() => scope.dispose());
  return scope;
}
