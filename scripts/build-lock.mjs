// One build at a time per checkout (scripts/build-examples.mjs, scripts/build-thumbnails.mjs): a
// lock is a folder (mkdir is atomic) that holds its owner's process id. Another build waits for it.
// A lock left by a build that died is taken over: at once when its owner has exited (a build that
// was killed), else when it is ten minutes old (longer than any build; a lock without an owner,
// from before owners were recorded, has only this).
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const STALE_AFTER = 10 * 60 * 1000;

function owner(lock) {
  try { return Number(readFileSync(path.join(lock, "owner"), "utf8")) || null; } catch { return null; }
}
function running(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

/** Whether `lock` was left by a build that is gone: its owner has exited, or it is ten minutes old. */
export function stale(lock, now = Date.now()) {
  try {
    const pid = owner(lock);
    return (pid !== null && !running(pid)) || now - statSync(lock).mtimeMs > STALE_AFTER;
  } catch {
    return false; // released meanwhile
  }
}

/** Waits for `lock` and takes it. Returns a function that releases it (if this process still holds it). */
export async function acquire(lock, { poll = 250 } = {}) {
  mkdirSync(path.dirname(lock), { recursive: true });
  for (;;) {
    try { mkdirSync(lock); break; } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // Removed only if it is still the stale one (another waiter may have taken it over).
      const pid = owner(lock);
      if (stale(lock) && owner(lock) === pid) rmSync(lock, { recursive: true, force: true });
      else await new Promise((resolve) => setTimeout(resolve, poll));
    }
  }
  writeFileSync(path.join(lock, "owner"), String(process.pid));
  return () => { if (owner(lock) === process.pid) rmSync(lock, { recursive: true, force: true }); };
}
