/**
 * Regression (TODO 47.1): a least-squares fit of y on x over the shown rows, sampled at
 * `samples` points across `extent` (default: the fitted rows' x range), with a confidence band.
 * method "linear" and "poly" (order) fit y on x; "log" on ln x; "exp" ln y on x; "pow" ln y on
 * ln x (rows a log cannot take are left out, with a warning). Everything runs on the device in
 * one compiled program per method, order, row count and sample count, so a Filter or brush
 * above refits with nothing read back: the powers of the standardized x as sums over the shown
 * rows, a Gauss-Jordan inverse of the small normal matrix, and the band
 * se(x0) = s * sqrt(v(x0)' (X'X)^-1 v(x0)) with Student's t at n - k - 1 degrees of freedom,
 * mapped back through exp for "exp" and "pow" (asymmetric there); band false leaves lower and
 * upper missing. LOESS is TODO 47.2.
 */
export const REGRESSION_METHODS = ["linear", "poly", "log", "exp", "pow"];
const degreeOf = (config) =>
  config.method === "poly" ? (config.order ?? 2) : 1;

/** Gauss-Jordan inverse of a small symmetric positive definite matrix [m, m]. Consumes a. */
function inverse(np, a, m) {
  let augmented = np.concatenate([a, np.eye(m)], 1);
  const rows = np.arange(m).reshape([m, 1]);
  for (let p = 0; p < m; p++) {
    const pivot = augmented.ref.slice([p, p + 1]);
    const row = pivot.ref.div(pivot.slice([], [p, p + 1]));
    const factor = augmented.ref.slice([], [p, p + 1]);
    const eliminated = augmented.sub(factor.mul(row.ref));
    augmented = np.where(rows.ref.equal(p), row, eliminated);
  }
  rows.dispose();
  return augmented.slice([], [m, 2 * m]);
}

const PROGRAMS = new WeakMap();
function regressionProgram(np, math, method, degree, samples, band, extent) {
  const { studentTTable, studentTOnDevice } = math;
  let programs = PROGRAMS.get(np);
  if (!programs) PROGRAMS.set(np, (programs = new Map()));
  const key = JSON.stringify([method, degree, samples, band, Boolean(extent)]);
  let program = programs.get(key);
  if (program) return program;
  if (programs.size >= 64) programs.delete(programs.keys().next().value);
  const logX = method === "log" || method === "pow",
    logY = method === "exp" || method === "pow";
  const m = degree + 1,
    t = band ? studentTTable((1 + band) / 2) : null;
  // [rows, count]: v^0 to v^(count - 1). Consumes v.
  const powers = (v, count) => {
    const columns = Array.from({ length: count }, (_, j) =>
      j === 0 ? np.onesLike(v.ref) : np.power(v.ref, j),
    );
    v.dispose();
    return np.stack(columns, 1);
  };
  program = (x, y, shown, bounds) => {
    let ok = np.logicalAnd(
      shown,
      np.logicalAnd(np.isfinite(x.ref), np.isfinite(y.ref)),
    );
    if (logX) ok = np.logicalAnd(ok, x.ref.greater(0));
    if (logY) ok = np.logicalAnd(ok, y.ref.greater(0));
    const w = ok.ref.astype(np.float32);
    const u = logX
      ? np.log(np.where(ok.ref, x.ref, 1))
      : np.where(ok.ref, x.ref, 0);
    const v = logY ? np.log(np.where(ok.ref, y, 1)) : np.where(ok.ref, y, 0);
    const n = np.sum(w.ref),
      safe = np.maximum(n.ref, 1);
    const mean = np.sum(w.ref.mul(u.ref)).div(safe.ref);
    const spread = np.sqrt(
      np.sum(w.ref.mul(np.square(u.ref.sub(mean.ref)))).div(safe.ref),
    );
    const scale = np.where(spread.ref.greater(0), spread, 1);
    const s = u.sub(mean.ref).div(scale.ref).mul(w.ref);
    // The normal matrix from the moments of s (sums of s^(i + j)), and X'v.
    const design = powers(s.ref, m);
    const moments = np.sum(powers(s, 2 * m - 1).mul(w.ref.reshape([-1, 1])), 0);
    const index = Array.from(
      { length: m * m },
      (_, k) => Math.floor(k / m) + (k % m),
    );
    const normal = np
      .take(moments, np.array(index, { dtype: np.int32 }), 0)
      .reshape([m, m]);
    const cross = np
      .sum(design.ref.mul(v.ref.mul(w.ref).reshape([-1, 1])), 0)
      .reshape([m, 1]);
    const covariance = inverse(np, normal, m);
    const beta = np.matmul(covariance.ref, cross);
    const fitted = np.matmul(design, beta.ref).reshape([-1]);
    const rss = np.sum(w.ref.mul(np.square(v.ref.sub(fitted))));
    const vMean = np.sum(w.ref.mul(v.ref)).div(safe);
    const tss = np.sum(w.mul(np.square(v.sub(vMean))));
    const r2 = np.ones([]).sub(rss.ref.div(tss));
    const df = n.ref.sub(m);
    // The sample positions: the extent given, else the fitted rows' x range.
    const lo = extent
      ? bounds.ref.slice([0, 1]).reshape([])
      : np.min(np.where(ok.ref, x.ref, Infinity));
    const hi = extent
      ? bounds.slice([1, 2]).reshape([])
      : (bounds.dispose(), np.max(np.where(ok, x, -Infinity)));
    if (extent) {
      ok.dispose();
      x.dispose();
    }
    const at = np
      .arange(samples)
      .astype(np.float32)
      .div(Math.max(1, samples - 1));
    const xs = lo.ref.add(hi.sub(lo).mul(at));
    const u0 = logX ? np.log(xs.ref) : xs.ref;
    const v0 = powers(u0.sub(mean.ref).div(scale.ref), m);
    const estimate = np.matmul(v0.ref, beta.ref).reshape([-1]);
    const out = [xs];
    const back = (value) => (logY ? np.exp(value) : value);
    if (band) {
      const spread0 = np.sum(np.matmul(v0.ref, covariance.ref).mul(v0), 1);
      const variance = rss.ref.div(np.maximum(df.ref, 1));
      const half = studentTOnDevice(t, df.ref).mul(
        np.sqrt(spread0.mul(variance)),
      );
      out.push(
        back(estimate.ref),
        back(estimate.ref.sub(half.ref)),
        back(estimate.add(half)),
      );
    } else {
      v0.dispose();
      out.push(back(estimate));
    }
    // The fit for fit(): n, the degrees of freedom, r², the standardization and the coefficients
    // in the standardized x.
    const stats = np.concatenate([
      np.stack([n, df, r2, mean, scale, rss]),
      beta.reshape([-1]),
    ]);
    covariance.dispose();
    return [...out, stats];
  };
  programs.set(key, program);
  return program;
}

/**
 * Coefficients of the fitted polynomial in u (x, or ln x) from those in the standardized
 * s = (u - mean) / scale: the binomial expansion of each power.
 */
export function unstandardize(beta, mean, scale) {
  const m = beta.length,
    out = new Array(m).fill(0);
  const choose = (n, k) => {
    let c = 1;
    for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
    return c;
  };
  for (let j = 0; j < m; j++)
    for (let i = 0; i <= j; i++)
      out[i] += (beta[j] * choose(j, i) * (-mean) ** (j - i)) / scale ** j;
  return out;
}

const warned = new Set();
export const regression = {
  reads: "padded",
  output: "newRows",
  parameters: {
    x: { type: "field" },
    y: { type: "field" },
    method: { type: "select", options: REGRESSION_METHODS, default: "linear" },
    order: { type: "number", integer: true, min: 1, max: 6, default: 2 },
    samples: {
      type: "number",
      integer: true,
      min: 2,
      max: 100000,
      default: 100,
    },
    extent: { type: "vector", length: 2 },
    band: {
      type: "union",
      variants: [
        { type: "number", min: 0, max: 1 },
        { type: "select", options: [false] },
      ],
      default: 0.95,
    },
  },
  outputs(params) {
    return ["x", "y", "lower", "upper"].map((name) => {
      const source = params[name === "x" ? "x" : "y"];
      return {
        name,
        type: "numeric",
        ...(typeof source === "string" ? { source } : {}),
      };
    });
  },
  async inspect({ resources, params }) {
    const values = Array.from(await resources.stats.ref.data(), Number);
    const [n, df, r2, mean, scale, rss] = values;
    return {
      method: params.method,
      order: degreeOf(params),
      n,
      df,
      r2,
      rss,
      coefficients: unstandardize(values.slice(6), mean, scale),
      variable:
        params.method === "log" || params.method === "pow" ? "ln x" : "x",
      response:
        params.method === "exp" || params.method === "pow" ? "ln y" : "y",
    };
  },
};

function runRegression(
  { column, valid, params, jit, jax: { numpy: np } },
  math,
) {
  const { method, samples, band, extent } = params,
    degree = degreeOf(params);
  if (params.x == null || params.y == null)
    throw Error("Regression: pass x and y columns or one value per row.");
  if (extent && !(extent[0] < extent[1]))
    throw Error("Regression extent must be [low, high] with low < high.");
  if ((method === "log" || method === "pow") && extent && extent[0] <= 0)
    throw Error(
      `Regression method "${method}" takes the log of x: its extent must be positive.`,
    );
  if (band !== false && !(band > 0 && band < 1))
    throw Error(
      "Regression band must be a confidence level between zero and one, or false.",
    );
  const results = jit(
    regressionProgram(
      np,
      math,
      method,
      degree,
      samples,
      band === false ? 0 : band,
      extent,
    ),
  )(
    column(params.x).ref,
    column(params.y).ref,
    valid.ref.greater(0),
    np.array(extent ?? [0, 0], { dtype: np.float32 }),
  );
  const stats = results.pop();
  const missing = band === false ? np.full([samples], NaN) : null;
  const columns = {
    x: results[0],
    y: results[1],
    lower: missing ?? results[2],
    upper: missing?.ref ?? results[3],
  };
  if (["log", "exp", "pow"].includes(method))
    warnLeftOut(np, column, params, method, valid);
  return {
    columns,
    resources: { stats },
    provenance: { kind: "regression", fields: Object.keys(columns) },
  };
}

/** Report excluded log values without blocking the fit's publication. */
function warnLeftOut(np, column, config, method, valid) {
  const x = column(config.x),
    y = column(config.y);
  let bad =
    method === "exp"
      ? y.ref.lessEqual(0)
      : method === "log"
        ? x.ref.lessEqual(0)
        : np.logicalOr(x.ref.lessEqual(0), y.ref.lessEqual(0));
  bad = np.logicalAnd(bad, valid.ref.greater(0));
  const countArray = np.sum(bad.astype(np.float32));
  countArray.ref
    .data()
    .then((values) => {
      const count = Number(values[0]);
      const name = (field) => (typeof field === "string" ? field : "values");
      const key = `${method}:${name(config.x)}:${name(config.y)}:${count}`;
      if (count > 0 && !warned.has(key)) {
        warned.add(key);
        const which =
          method === "exp" ? "y" : method === "log" ? "x" : "x or y";
        console.warn(
          `Regression "${method}" takes the log of ${which}: ${count} row${count === 1 ? "" : "s"} with a value of zero or below ${count === 1 ? "is" : "are"} left out.`,
        );
      }
    })
    .catch(() => {})
    .finally(() => countArray.dispose());
}

export default {
  name: "hmplot.regression",
  apiVersion: 1,
  setup(hm) {
    hm.transform("Regression", {
      ...regression,
      run: (inputs) => runRegression(inputs, hm.math),
    });
  },
};
