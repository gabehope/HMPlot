// @ts-check
/**
 * One dispose per owner, run once (TODO 32.1). A mark's prepared entry owns prepareNamed's arrays
 * plus what later steps add (a Filter's row opacity, brush columns, a retained scope, Dodge's
 * offsets). Each step used to re-wrap `dispose`, and a preparation that failed after handing the
 * entry around could dispose it twice, or not at all.
 *
 * `owner.own(release)` adds a release that runs before the owner's own dispose, newest first;
 * `owner.own(release, { after: true })` one that runs after it, in order (what the owner's arrays
 * borrow from: a retained scope, arrays its props point at). A release added once the owner is
 * disposed runs at once. Returns the owner.
 */
/**
 * @template {{dispose?(): void}} T
 * @param {T} owner
 * @returns {T & {dispose(): void; own(release: () => void, options?: {after?: boolean}): void}}
 */
export function disposeOnce(owner) {
  const lifetime =
    /** @type {T & {dispose(): void; own(release: () => void, options?: {after?: boolean}): void}} */ (
      owner
    );
  const base = owner.dispose;
  /** @type {(() => void)[]} */
  const before = [];
  /** @type {(() => void)[]} */
  const after = [];
  let disposed = false;
  lifetime.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const release of before.splice(0).reverse()) release();
    base?.call(owner);
    for (const release of after.splice(0)) release();
  };
  lifetime.own = (release, { after: late = false } = {}) => {
    if (disposed) release();
    else (late ? after : before).push(release);
  };
  return lifetime;
}
