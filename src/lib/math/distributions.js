import { numpy as np } from "@hmplot/jax";

/** Acklam's inverse-normal approximation. */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1))
    throw Error("Normal probability must be between zero and one.");
  const a = [
      -39.69683028665376, 220.9460984245205, -275.9285104469687,
      138.357751867269, -30.66479806614716, 2.506628277459239,
    ],
    b = [
      -54.47609879822406, 161.5858368580409, -155.6989798598866,
      66.80131188771972, -13.28068155288572,
    ],
    c = [
      -0.007784894002430293, -0.3223964580411365, -2.400758277161838,
      -2.549732539343734, 4.374664141464968, 2.938163982698783,
    ],
    d = [
      0.007784695709041462, 0.3224671290700398, 2.445134137142996,
      3.754408661907416,
    ],
    lo = 0.02425,
    hi = 1 - lo;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > hi) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  const q = p - 0.5,
    r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/** ln Γ(x) for x > 0 (Lanczos, g = 7). */
function logGamma(x) {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61503916999185, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return (
    0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
  );
}
/** The regularized incomplete beta function I_x(a, b) (a continued fraction, Lentz's method). */
function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - incompleteBeta(1 - x, b, a);
  const front =
    Math.exp(
      logGamma(a + b) -
        logGamma(a) -
        logGamma(b) +
        a * Math.log(x) +
        b * Math.log(1 - x),
    ) / a;
  let f = 1,
    c = 1,
    d = 0;
  for (let i = 0; i <= 400; i++) {
    const m = Math.floor(i / 2);
    const numerator =
      i === 0
        ? 1
        : i % 2 === 0
          ? (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
          : -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    d = Math.abs(d) < 1e-300 ? 1e-300 : d;
    c = 1 + numerator / c;
    c = Math.abs(c) < 1e-300 ? 1e-300 : c;
    d = 1 / d;
    const step = c * d;
    f *= step;
    if (Math.abs(1 - step) < 1e-15) break;
  }
  return front * (f - 1);
}
/** Student's t distribution function with `df` degrees of freedom. */
export function studentTCdf(t, df) {
  const tail = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}
/**
 * Student's t quantile: the t with probability `p` below it at `df` degrees of freedom
 * (TODO 47: a regression's confidence band). NaN when df is not positive.
 */
export function studentTQuantile(p, df) {
  if (!(p > 0 && p < 1))
    throw Error("A t quantile's probability must be between zero and one.");
  if (!(df > 0)) return NaN;
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  if (p === 0.5) return 0;
  // Bracket, then bisect: the distribution function is monotonic.
  let lo = 0,
    hi = Math.max(1, normalQuantile(p) * 2);
  while (studentTCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/**
 * The t quantiles at `p` for 1 to `count` degrees of freedom, and the Cornish-Fisher expansion's
 * coefficients past them ({ table, z, terms }), for evaluating the quantile at a degrees-of-
 * freedom count only the device knows (studentTOnDevice).
 */
export function studentTTable(p, count = 60) {
  const z = normalQuantile(p);
  const terms = [
    (z ** 3 + z) / 4,
    (5 * z ** 5 + 16 * z ** 3 + 3 * z) / 96,
    (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / 384,
    (79 * z ** 9 + 776 * z ** 7 + 1482 * z ** 5 - 1920 * z ** 3 - 945 * z) /
      92160,
  ];
  return {
    table: Array.from({ length: count }, (_, i) => studentTQuantile(p, i + 1)),
    z,
    terms,
  };
}
/**
 * The t quantile at `df` (a device array of degrees of freedom): the exact table below its
 * length, the Cornish-Fisher expansion past it (within 1e-6 there), NaN at df < 1. Consumes df.
 */
export function studentTOnDevice({ table, z, terms }, df) {
  const nu = df.astype(np.float32),
    n = table.length;
  const exact = np.take(
    np.array(table, { dtype: np.float32 }),
    np.clip(np.round(nu.ref).astype(np.int32).sub(1), 0, n - 1),
    0,
  );
  const inv = np.reciprocal(np.maximum(nu.ref, 1));
  let series = np.full([], z, { dtype: np.float32 });
  let power = inv.ref;
  for (const term of terms) {
    series = series.add(power.ref.mul(term));
    power = power.mul(inv.ref);
  }
  power.dispose();
  inv.dispose();
  return np.where(
    nu.ref.less(0.5),
    NaN,
    np.where(nu.greater(n + 0.5), series, exact),
  );
}
