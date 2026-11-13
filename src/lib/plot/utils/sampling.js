// Skip-based reservoir sampling (Algorithm L). Appends retain prior selections;
// random draws depend on source indices, not render frames or camera movement.
export class Reservoir {
  constructor(seed = 42) {
    this.seed = seed;
    this.reset(0);
  }
  random() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 || 1 / 4294967296;
  }
  reset(k) {
    this.k = k;
    this.state = this.seed;
    this.items = [];
    this.seen = 0;
    this.next = 0;
    this.weight = 0;
  }
  sample(n, k) {
    k = Math.max(0, Math.min(n, Math.floor(k)));
    if (k !== this.k || n < this.seen) this.reset(k);
    if (!k) {
      this.seen = n;
      return [];
    }
    if (!this.items.length) {
      this.items = Array.from({ length: k }, (_, i) => i);
      this.weight = Math.exp(Math.log(this.random()) / k);
      this.next =
        k + Math.floor(Math.log(this.random()) / Math.log1p(-this.weight));
    }
    while (this.next < n) {
      this.items[Math.floor(this.random() * k)] = this.next;
      this.weight *= Math.exp(Math.log(this.random()) / k);
      this.next +=
        1 + Math.floor(Math.log(this.random()) / Math.log1p(-this.weight));
    }
    this.seen = n;
    return [...this.items].sort((a, b) => a - b);
  }
}
export function instanceLimit(value) {
  if (value == null || value === "") return Infinity;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1)
    throw Error(
      "Instance limit must be a positive integer, or empty for unlimited.",
    );
  return n;
}
export function displayMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0)
    throw Error("Display scale must be finite and nonnegative.");
  return n;
}
