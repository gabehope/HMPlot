/** First-party Gaussian density estimation: only the public plug-in contract is used. */
const perAxis = (item) => ({
  type: "union",
  variants: [item, { type: "array", items: item, minLength: 1, maxLength: 2 }],
});
export const density = {
  reads: "padded",
  output: "newRows",
  parameters: {
    x: { type: "field" },
    y: { type: "field" },
    weight: { type: "field" },
    resolution: perAxis({ type: "expression", integer: true, min: 2 }),
    bandwidth: {
      type: "union",
      default: "auto",
      variants: [
        { type: "select", options: ["auto"] },
        ...perAxis({ type: "expression", min: 0 }).variants,
      ],
    },
    bounds: {
      type: "object",
      required: ["x"],
      properties: {
        x: { type: "vector", length: 2 },
        y: { type: "vector", length: 2 },
      },
    },
    normalization: {
      type: "select",
      options: ["density", "count"],
      default: "density",
    },
    violin: {
      type: "object",
      properties: {
        scale: { type: "select", options: ["width", "area", "count"] },
        width: { type: "number" },
        side: { type: "select", options: ["both", "left", "right"] },
        orientation: { type: "select", options: ["horizontal", "vertical"] },
      },
    },
  },
  categoryAxis: (params) =>
    params.violin
      ? params.violin.orientation === "horizontal"
        ? "y"
        : "x"
      : null,
  outputs: (params) => [
    { name: "x", type: "numeric", source: params.x },
    ...(params.y === undefined
      ? []
      : [{ name: "y", type: "numeric", source: params.y }]),
  ],
};

export const densityPaths = { compiled: true, binnedAbove: 2 ** 28 };
function createDensity(hm) {
  const { numpy: np, jit, lax } = hm.jax;

  const scalar = async (value) => {
    try {
      return Number((await value.ref.data())[0]);
    } finally {
      value.dispose();
    }
  };
  // Keep wide-column reductions parallel, matching the existing numerical kernels.
  function reduceRows(values, op) {
    const n = values.shape[0];
    if (n < 65536) return np[op](values, 0);
    const length = Math.ceil(n / 256),
      padded = length * 256;
    const whole =
      padded === n
        ? values
        : np.concatenate([
            values,
            np.full([padded - n], op === "min" ? Infinity : -Infinity),
          ]);
    return np[op](np[op](whole.reshape([256, length]), 1), 0);
  }
  const finiteRangeWhere = (values, valid) => {
    const keep = valid
      ? np.logicalAnd(np.isfinite(values.ref), valid.greater(0))
      : np.isfinite(values.ref);
    return np.stack([
      reduceRows(np.where(keep.ref, values.ref, Infinity), "min"),
      reduceRows(np.where(keep, values, -Infinity), "max"),
    ]);
  };
  const finiteRange = (values) => finiteRangeWhere(values, null);
  const evenDimension = (name, [lo, hi], size) => ({
    name,
    coords: Float64Array.from(
      { length: size },
      (_, i) => lo + ((i + 0.5) / size) * (hi - lo),
    ),
    edges: Float64Array.from(
      { length: size + 1 },
      (_, i) => lo + (i / size) * (hi - lo),
    ),
  });
  function groupedRowsShown(shown, size, separated) {
    const count = shown.shape[0],
      stride = size + (separated ? 1 : 0);
    const total = Math.max(0, count * stride - (separated ? 1 : 0));
    const row = np.arange(total).astype(np.float32);
    const group = np.floor(row.ref.div(stride)).astype(np.int32);
    const groupShown = np.take(shown.ref, group.ref, 0);
    if (!separated) {
      row.dispose();
      group.dispose();
      return groupShown;
    }
    // A separator row (row + 1 a multiple of the stride) is shown when a later group is too.
    const later = np.sum(shown.ref).sub(np.cumsum(shown.ref, 0));
    const separator = np.remainder(row.add(1), stride).equal(0);
    const followed = np.take(later, group, 0).greater(0).astype(np.int32);
    return np
      .where(separator, groupShown.ref.mul(followed), groupShown)
      .astype(np.int32);
  }
  const list = (value) =>
    value == null ? [] : Array.isArray(value) ? value : [value];
  const abort = (signal) => {
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  };

  /**
   * One row chunk's part of every group's density (TODO 26.3): the kernel block [queries x chunk]
   * times the weight block [chunk x groups], the chunk's weight per group and, over a padded
   * input, its shown rows per group. One jitted program per variant (1D or 2D, grouped, counting
   * shown rows) and chunk shape: run eagerly, a chunk was about a dozen operations, each built,
   * hashed and dispatched on the main thread. Arguments are consumed.
   */
  const CHUNK_PROGRAMS = new Map();
  /**
   * @typedef {import('@hmplot/jax').Array} DensityArray
   * @typedef {{
   *   xGrid: DensityArray, xRows: DensityArray, xVariance: DensityArray,
   *   yGrid?: DensityArray, yRows?: DensityArray, yVariance?: DensityArray,
   *   rowWeight: DensityArray, codes?: DensityArray, groupIds?: DensityArray,
   *   shownRows?: DensityArray, sums: DensityArray, groupWeight: DensityArray,
   *   present?: DensityArray
   * }} DensityChunkInputs All arrays are consumed by the compiled chunk.
   */
  function chunkProgram(two, grouped, counted) {
    const key = `${two}:${grouped}:${counted}`;
    let program = CHUNK_PROGRAMS.get(key);
    if (program) return program;
    // The whole padded columns, the running totals, then the chunk's first row and size (static:
    // one trace per chunk position; the offsets are uniforms, so the GPU programs are shared).
    // Slicing the chunk and adding it to the totals happen inside (TODO 33.3): a chunk was a
    // dozen eager operations around this program.
    program = jit(
      (inputs, from, size) => {
        const part = (array) => array.slice([from, from + size]);
        const { xGrid: gx, xVariance, groupWeight } = inputs;
        const xs = part(inputs.xRows).reshape([1, size]);
        const gy = two ? inputs.yGrid : null;
        const ys = two ? part(inputs.yRows).reshape([1, size]) : null;
        const weights = part(inputs.rowWeight).reshape([size, 1]);
        const codes = grouped ? part(inputs.codes).reshape([size, 1]) : null;
        const shown = counted
          ? part(inputs.shownRows).reshape([size, 1])
          : null;
        let exponent = np.square(gx.sub(xs)).div(xVariance);
        if (two)
          exponent = exponent.add(np.square(gy.sub(ys)).div(inputs.yVariance));
        const kernel = np.exp(exponent.mul(-0.5));
        const member = grouped ? codes.equal(inputs.groupIds) : null;
        const block = grouped ? np.where(member.ref, weights, 0) : weights;
        const sums = np.matmul(kernel, block.ref),
          weight = np.sum(block, 0);
        if (!counted) {
          member?.dispose();
          return {
            sums: inputs.sums.add(sums),
            groupWeight: groupWeight.add(weight),
          };
        }
        return {
          sums: inputs.sums.add(sums),
          groupWeight: groupWeight.add(weight),
          present: inputs.present.add(
            np.sum(np.where(member, shown.astype(np.float32), 0), 0),
          ),
        };
      },
      { staticArgnums: [1, 2] },
    );
    CHUNK_PROGRAMS.set(key, program);
    return program;
  }

  /**
   * The query grid of `spec` from `params` (see finishKernel): each query's x and, in 2D, y
   * ([T] each; null for y in 1D). A 2-D grid samples its cells' centres, (i + 0.5) / res, so its
   * cells tile the bounds (TODO 51 decision 11); a 1-D curve reaches its ends, i / (res - 1).
   * Borrows `params`.
   */
  function queryGrid({ two, resolution }, params) {
    const T = resolution.reduce((a, b) => a * b, 1),
      p = (i) => params.ref.slice(i);
    const qx = np.arange(T).astype(np.float32);
    const gx = two
      ? np
          .remainder(qx.ref, resolution[0])
          .add(0.5)
          .div(resolution[0])
          .mul(p(0))
          .add(p(1))
      : qx.ref
          .div(resolution[0] - 1)
          .mul(p(0))
          .add(p(1));
    const gy = two
      ? np
          .floor(qx.ref.div(resolution[0]))
          .add(0.5)
          .div(resolution[1])
          .mul(p(2))
          .add(p(3))
      : null;
    qx.dispose();
    return [gx, gy];
  }

  /**
   * Everything after the kernel sums, for both paths (TODO 33.3): the [groups x queries]
   * densities normalized per group (by its total weight, or not at all for counts), the
   * group-major layout (with a violin's separators), a violin's outline, the group keys repeated
   * over their rows and, over hidden rows, which rows are shown (groups with no shown row and the
   * separators around them are hidden: the compacted rows are the shown groups' curves, as the
   * compacted input would give) and how many. `spec` holds what shapes it (dimensions, grouping,
   * resolution, group count, layout, violin scale and side, which keys are categorical). Consumes
   * `sums` [T x G], `groupWeight` [G], `present` (each group's shown rows, or null), `params` ([x
   * span, x start, y span, y start, x variance, y variance, gaussian factor, half violin width]),
   * `center` (a violin's group centers, [G x 1]) and `keys` (each key's values or codes, [G]).
   * Returns { x, y, density, lower, upper, keys, mask, count }, the absent ones left out.
   */
  function finishKernel(
    spec,
    sums,
    groupWeight,
    present,
    params,
    center,
    keys,
  ) {
    const {
      two,
      resolution,
      groups: G,
      separated,
      counts,
      violin,
      categorical,
    } = spec;
    const T = resolution.reduce((a, b) => a * b, 1);
    const [gx, gy] = queryGrid(spec, params);
    const denominator = counts
      ? np.ones([G])
      : np.maximum(groupWeight.ref, 1e-30);
    const density = np
      .transpose(sums, [1, 0])
      .mul(params.ref.slice(6))
      .div(denominator.reshape([G, 1]));
    const layout = (grid, fill = NaN) =>
      !G
        ? (grid.dispose(), np.zeros([0]))
        : !separated
          ? grid.reshape([G * T])
          : np
              .concatenate([grid, np.full([G, 1], fill)], 1)
              .reshape([G * (T + 1)])
              .slice([0, G * (T + 1) - 1]);
    const perGroup = (a) => np.broadcastTo(a.reshape([1, T]), [G, T]);
    const out = { x: layout(perGroup(gx)), density: layout(density.ref) };
    if (two) out.y = layout(perGroup(gy));
    if (violin) {
      let magnitude = density.ref;
      if (violin.scale === "width")
        magnitude = magnitude.div(
          np.maximum(np.max(density.ref, 1, { keepdims: true }), 1e-30),
        );
      else if (violin.scale === "count")
        magnitude = magnitude.mul(groupWeight.ref.reshape([G, 1]));
      magnitude = magnitude.mul(params.ref.slice(7));
      const flat = np.broadcastTo(center.ref, [G, T]);
      out.lower = layout(
        violin.side === "right" ? flat.ref : center.ref.sub(magnitude.ref),
      );
      out.upper = layout(
        violin.side === "left" ? flat.ref : center.ref.add(magnitude.ref),
      );
      magnitude.dispose();
      flat.dispose();
    }
    out.keys = keys.map((value, k) => {
      const repeated = layout(np.broadcastTo(value.reshape([G, 1]), [G, T]), 0);
      return categorical[k] ? repeated.astype(np.int32) : repeated;
    });
    if (present) {
      const shownGroups = present.greater(0).astype(np.int32);
      out.mask = groupedRowsShown(shownGroups, T, Boolean(violin));
      out.count = np.sum(out.mask.ref);
      shownGroups.dispose();
    }
    density.dispose();
    groupWeight.dispose();
    center.dispose();
    params.dispose();
    return out;
  }

  /**
   * The rows padded to `n` (static) with rows of weight 0: x, y, weight (0 where not finite: a
   * missing value's kernel entry would be NaN, and NaN x 0 is NaN in a matrix product), the codes
   * and shown weights. Consumes its arguments.
   */
  const padRowsProgram = jit(
    (x, y, weight, finite, codes, shownWeight, n) => {
      const pad = (a) =>
        n === a.shape[0]
          ? a
          : np.concatenate([a, np.zeros([n - a.shape[0]], { dtype: a.dtype })]);
      const kept = (a) => pad(np.where(finite.ref, a, 0));
      const out = [
        kept(x),
        kept(y),
        kept(weight),
        pad(codes),
        pad(shownWeight),
      ];
      finite.dispose();
      return out;
    },
    { staticArgnums: [6] },
  );

  /** Tests set `compiled` false to run the chunked path on small inputs, and `binnedAbove` lower
   * to run the binned one (TODO 134.20). */

  const PROGRAMS = new Map();
  /** A compiled program per kind and spec (a bounded set, oldest dropped). */
  function programFor(kind, spec, build) {
    const key = kind + JSON.stringify(spec);
    let program = PROGRAMS.get(key);
    if (!program) {
      if (PROGRAMS.size >= 64) PROGRAMS.delete(PROGRAMS.keys().next().value);
      PROGRAMS.set(key, (program = build()));
    }
    return program;
  }

  /**
   * The whole estimate for inputs whose rows fit in one chunk, as one compiled program (TODO
   * 33.3): the query grid, the kernel block times the weight block (as chunkProgram does for one
   * chunk), then finishKernel. Its rows come padded (padRowsProgram); y in 1D, the codes without
   * groups, the shown weights when nothing is hidden and a violin's centers are placeholders.
   * Consumes its arguments.
   */
  const singleChunkProgram = (spec) =>
    programFor("single", spec, () => {
      const { two, grouped, counted, resolution, groups: G } = spec;
      const T = resolution.reduce((a, b) => a * b, 1);
      return jit(
        (xs, ys, rowWeight, codeRows, shownAll, params, center, keys) => {
          const n = xs.shape[0];
          const [gx, gy] = queryGrid(spec, params);
          let exponent = np
            .square(gx.reshape([T, 1]).sub(xs.reshape([1, n])))
            .div(params.ref.slice(4));
          if (two)
            exponent = exponent.add(
              np
                .square(gy.reshape([T, 1]).sub(ys.reshape([1, n])))
                .div(params.ref.slice(5)),
            );
          else ys.dispose();
          const kernel = np.exp(exponent.mul(-0.5));
          const member = grouped
            ? codeRows
                .reshape([n, 1])
                .equal(np.arange(G).astype(np.int32).reshape([1, G]))
            : (codeRows.dispose(), null);
          const block = grouped
            ? np.where(member.ref, rowWeight.reshape([n, 1]), 0)
            : rowWeight.reshape([n, 1]);
          const sums = np.matmul(kernel, block.ref),
            groupWeight = np.sum(block, 0);
          const present = counted
            ? np.sum(np.where(member, shownAll.reshape([n, 1]), 0), 0)
            : (member?.dispose(), shownAll.dispose(), null);
          return finishKernel(
            spec,
            sums,
            groupWeight,
            present,
            params,
            center,
            keys,
          );
        },
      );
    });

  /**
   * The chunked path's named grid inputs from `params` (compiled): the grid's x (and y)
   * as a column, the x (and y) variance, and the group ids. Consumes `params`.
   */
  const gridProgram = (spec) =>
    programFor("grid", spec, () =>
      jit((params) => {
        const { two, grouped, resolution, groups: G } = spec;
        const T = resolution.reduce((a, b) => a * b, 1);
        const [gx, gy] = queryGrid(spec, params);
        const out = {
          xGrid: gx.reshape([T, 1]),
          xVariance: params.ref.slice(4),
        };
        if (two) {
          out.yGrid = gy.reshape([T, 1]);
          out.yVariance = params.ref.slice(5);
        }
        if (grouped)
          out.groupIds = np.arange(G).astype(np.int32).reshape([1, G]);
        params.dispose();
        return out;
      }),
    );

  /** finishKernel compiled, for the chunked path's totals (`present` only when counted). */
  const finishProgram = (spec) =>
    programFor("finish", spec, () =>
      spec.counted
        ? jit((sums, groupWeight, present, params, center, keys) =>
            finishKernel(
              spec,
              sums,
              groupWeight,
              present,
              params,
              center,
              keys,
            ),
          )
        : jit((sums, groupWeight, params, center, keys) =>
            finishKernel(spec, sums, groupWeight, null, params, center, keys),
          ),
    );

  /**
   * Above densityPaths.binnedAbove kernel entries (rows x queries), Density counts its rows onto a
   * fine grid and smooths the counts (TODO 134.20): exact over every pair, ten million rows on a
   * 512 x 512 grid were 2.6 trillion kernel entries and never finished. Below it, it stays exact.
   */
  /** The most bins (over every group) the binned path counts into: 64 MB of float32. */
  const MOST_BINS = 2 ** 24;

  /**
   * The binned path's grid per axis: `bins` (a power of two, so a new extent compiles nothing new)
   * from `lo` in steps of `step`, covering the query bounds and four bandwidths past them (a row
   * further out adds under e^-8 of its peak). A bin is at most a quarter of a query cell, and the
   * bandwidth is at least a cell, so moving a row to its bin's center moves it by at most an
   * eighth of a bandwidth: well under a percent of the estimate.
   */
  function binnedGrid(resolution, bounds, bandwidth, groups) {
    const axes = resolution.map((cells, i) => {
      const [a, b] = bounds[i],
        pad = 4 * bandwidth[i],
        lo = a - pad,
        span = b - a + 2 * pad;
      let bins =
        2 ** Math.ceil(Math.log2(Math.max(2, (4 * cells * span) / (b - a))));
      return { lo, span, bins };
    });
    // Coarser (halving the finest axis) until every group's bins fit.
    while (groups * axes.reduce((n, a) => n * a.bins, 1) > MOST_BINS) {
      const finest = axes.reduce((best, a) => (a.bins > best.bins ? a : best));
      finest.bins /= 2;
    }
    return axes.map(({ lo, span, bins }) => ({ lo, step: span / bins, bins }));
  }

  /**
   * Kernel sums from binned rows, compiled per spec and bin counts (consumes its arguments): each
   * row's weight is added to its bin (lax.scatter; integer counts without weights, so the result
   * is deterministic), then the Gaussian, separable in x and y, smooths the bins onto the queries:
   * Ky · H · Kxᵀ per group. Returns { sums [T x G], groupWeight [G], present [G] when counted }, as the
   * chunked path's totals. `grid` is [x lo, x step, y lo, y step].
   */
  const binnedProgram = (spec, bins, weighted) =>
    programFor("binned", { ...spec, bins, weighted }, () => {
      const { two, grouped, counted, resolution, groups: G } = spec;
      const T = resolution.reduce((a, b) => a * b, 1);
      return jit((xs, ys, rowWeight, codes, shownRows, params, grid) => {
        const g = (i) => grid.ref.slice(i);
        const index = (values, axis) =>
          np.floor(values.sub(g(2 * axis)).div(g(2 * axis + 1)));
        const ix = index(xs, 0);
        let inside = np.logicalAnd(
          np.logicalAnd(ix.ref.greaterEqual(0), ix.ref.less(bins[0])),
          rowWeight.ref.greater(0),
        );
        let flat = ix;
        if (two) {
          const iy = index(ys, 1);
          inside = np.logicalAnd(
            inside,
            np.logicalAnd(iy.ref.greaterEqual(0), iy.ref.less(bins[1])),
          );
          flat = iy.mul(bins[0]).add(flat);
        } else ys.dispose();
        const cells = bins.reduce((a, b) => a * b, 1);
        // Group-major: a group's bins follow the last group's (float32 holds every index: < 2^24).
        if (grouped) flat = flat.add(codes.ref.astype(np.float32).mul(cells));
        const at = np.where(inside, flat, -1).astype(np.int32);
        const counts = weighted
          ? lax.scatter(rowWeight.ref, at, [G * cells], { mode: "add" })
          : lax
              .scatter(rowWeight.ref.astype(np.int32), at, [G * cells], {
                mode: "add",
              })
              .astype(np.float32);
        // The queries and the bins' centers on each axis, and the kernel between them.
        const p = (i) => params.ref.slice(i);
        const queries = (axis) => {
          const R = resolution[axis],
            i = np.arange(R).astype(np.float32);
          return (two ? i.add(0.5).div(R) : i.div(R - 1))
            .mul(p(2 * axis))
            .add(p(2 * axis + 1));
        };
        const kernel = (axis) => {
          const centers = np
            .arange(bins[axis])
            .astype(np.float32)
            .add(0.5)
            .mul(g(2 * axis + 1))
            .add(g(2 * axis));
          const d = queries(axis)
            .reshape([resolution[axis], 1])
            .sub(centers.reshape([1, bins[axis]]));
          return np.exp(
            np
              .square(d)
              .div(p(4 + axis))
              .mul(-0.5),
          );
        };
        let sums;
        if (two) {
          const H = counts.reshape([G, bins[1], bins[0]]);
          const ky = np.broadcastTo(
            kernel(1).reshape([1, resolution[1], bins[1]]),
            [G, resolution[1], bins[1]],
          );
          const kx = np.broadcastTo(
            np
              .transpose(kernel(0), [1, 0])
              .reshape([1, bins[0], resolution[0]]),
            [G, bins[0], resolution[0]],
          );
          sums = np.transpose(
            np.matmul(np.matmul(ky, H), kx).reshape([G, T]),
            [1, 0],
          );
        } else {
          sums = np.matmul(
            kernel(0),
            np.transpose(counts.reshape([G, bins[0]]), [1, 0]),
          );
        }
        // Each group's whole weight and shown rows, over every row (not only those in the bins).
        const byGroup = (values) =>
          grouped
            ? lax.scatter(values, codes.ref.astype(np.int32), [G], {
                mode: "add",
              })
            : np.sum(values).reshape([1]);
        const groupWeight = byGroup(rowWeight);
        const present = counted
          ? byGroup(shownRows)
          : (shownRows.dispose(), null);
        codes.dispose();
        params.dispose();
        grid.dispose();
        // (A compiled program's outputs are arrays: no `present` key when nothing is counted.)
        return present ? { sums, groupWeight, present } : { sums, groupWeight };
      });
    });

  /** The weighted statistics Scott's rule needs, on the device: [sum of weights, sum of squared
   * weights, variance] (float32 [3]). Borrows its arguments. */
  function summaryArrays(value, weight, mask) {
    const w = np.where(mask.ref, weight.ref, 0);
    const sw = np.sum(w.ref),
      sw2 = np.sum(np.square(w));
    const mean = np
      .sum(np.where(mask.ref, value.ref.mul(weight.ref), 0))
      .div(np.maximum(sw.ref, 1e-30));
    const variance = np
      .sum(
        np.where(mask.ref, np.square(value.ref.sub(mean)).mul(weight.ref), 0),
      )
      .div(np.maximum(sw.ref, 1e-30));
    return np.stack([sw, sw2, variance]);
  }
  /**
   * The numbers read back before the estimate (TODO 26.3), as one compiled program (TODO 33.3):
   * for each measured column, Scott's statistics (summaryArrays; unless the bandwidth is given)
   * then its finite extent (unless the bounds are given), over the shown rows. `inputs`: values
   * (the measured columns), weight, finite and, over hidden rows, valid. Consumes `inputs`.
   */
  const readbackProgram = (spec) =>
    programFor("readback", spec, () =>
      jit(({ values, weight, finite, valid }) => {
        const parts = [];
        for (const v of values) {
          if (spec.stats) parts.push(summaryArrays(v, weight, finite));
          if (spec.extents)
            parts.push(
              valid
                ? finiteRangeWhere(v.ref.astype(np.float32), valid.ref)
                : finiteRange(v.ref.astype(np.float32)),
            );
          v.dispose();
        }
        for (const a of [weight, finite, valid]) a?.dispose();
        return np.concatenate(parts);
      }),
    );
  const summary = ([weight, squared, variance]) => ({
    weight,
    effective: squared ? weight ** 2 / squared : 0,
    deviation: Math.sqrt(Math.max(0, variance)),
  });

  /** Gaussian KDE evaluated in bounded query chunks. Source arrays remain on the GPU. */
  const resolutionOf = (config, dimensions) =>
    typeof config.resolution === "number"
      ? Array(dimensions).fill(config.resolution)
      : (config.resolution ?? (dimensions === 1 ? [256] : [128, 128]));

  async function estimateDensity(input, config, own) {
    const { signal, array, checkBytes } = input;
    const dimensions = config.y === undefined ? 1 : 2,
      resolution = resolutionOf(config, dimensions);
    let groups;
    abort(signal);
    const rows = { length: input.length };
    const shown = input.valid ? own(input.valid.ref.greater(0)) : null;
    const x = own(input.column(config.x).ref);
    const y = dimensions === 2 ? own(input.column(config.y).ref) : null;
    const weight =
      config.weight === undefined
        ? own(np.ones([rows.length]))
        : own(input.column(config.weight).ref);
    const measured =
      dimensions === 1
        ? np.logicalAnd(
            np.isfinite(x.ref),
            np.logicalAnd(np.isfinite(weight.ref), weight.ref.greaterEqual(0)),
          )
        : np.logicalAnd(
            np.logicalAnd(np.isfinite(x.ref), np.isfinite(y.ref)),
            np.logicalAnd(np.isfinite(weight.ref), weight.ref.greaterEqual(0)),
          );
    const finite = own(shown ? np.logicalAnd(measured, shown.ref) : measured);
    const weighted = shown
      ? np.logicalAnd(np.isfinite(weight.ref), shown.ref)
      : np.isfinite(weight.ref);
    // (Without a weight column every weight is 1: nothing to check or read back.)
    if (config.weight !== undefined) {
      if ((await scalar(np.min(np.where(weighted, weight.ref, Infinity)))) < 0)
        throw Error("Density weights must be nonnegative.");
    } else weighted.dispose();
    groups = input.groups;
    const groupCount = groups?.count ?? 1;
    const totalPerGroup = resolution.reduce((a, b) => a * b, 1);
    checkBytes(groupCount * totalPerGroup * 32, {
      what: "its output",
      hint: "Use a lower resolution, or fewer groups.",
    });

    const values = [x, ...(y ? [y] : [])];
    const bandwidthOption = config.bandwidth ?? "auto";
    const explicit =
      bandwidthOption === "auto"
        ? null
        : Array.isArray(bandwidthOption)
          ? bandwidthOption
          : Array(dimensions).fill(bandwidthOption);
    if (
      explicit &&
      (explicit.length !== dimensions ||
        explicit.some((v) => !Number.isFinite(v) || v <= 0))
    )
      throw Error("Density bandwidth must be positive and finite.");

    // One shared query grid keeps grouped curves directly comparable. The bandwidth statistics
    // (Scott's rule) and the grid's range of every axis come back in one readback (TODO 26.3;
    // they were four for a violin).
    const numbers =
      explicit && config.bounds
        ? []
        : Array.from(
            await readbackProgram({
              stats: !explicit,
              extents: !config.bounds,
            })({
              values: values.map((v) => v.ref),
              weight: weight.ref,
              finite: finite.ref,
              ...(shown ? { valid: input.valid.ref } : {}),
            }).data(),
            Number,
          );
    let at = 0;
    const globalStats = [],
      extents = [];
    for (let i = 0; i < dimensions; i++) {
      if (!explicit) {
        globalStats.push(summary(numbers.slice(at, at + 3)));
        at += 3;
      }
      if (!config.bounds) {
        const [a, b] = numbers.slice(at, at + 2);
        at += 2;
        extents.push(
          Number.isFinite(a) && Number.isFinite(b) ? [a, b] : [0, 1],
        );
      }
    }
    const bandwidth =
      explicit ??
      globalStats.map((s, axis) => {
        const exponent = -1 / (dimensions + 4);
        const scott = Math.max(1, s.effective) ** exponent;
        const extent = config.bounds?.[["x", "y"][axis]];
        const span = extent ? extent[1] - extent[0] : 0;
        return Math.max(
          s.deviation * scott,
          span / resolution[axis] || 1e-6,
          1e-6,
        );
      });
    let bounds = config.bounds;
    if (!bounds) {
      bounds = {};
      for (let i = 0; i < dimensions; i++)
        bounds[["x", "y"][i]] = [
          extents[i][0] - 3 * bandwidth[i],
          extents[i][1] + 3 * bandwidth[i],
        ];
    }
    for (const axis of ["x", ...(y ? ["y"] : [])]) {
      const b = bounds[axis];
      if (
        !Array.isArray(b) ||
        b.length !== 2 ||
        !b.every(Number.isFinite) ||
        b[1] <= b[0]
      )
        throw Error(`Invalid Density ${axis} bounds.`);
    }

    // A violin's checks, before either path; its groups' centers on the category axis (their
    // index in the axis order, if given).
    let violin = null,
      center = null;
    if (config.violin) {
      if (!groups || list(config.by).length !== 1 || dimensions !== 1)
        throw Error(
          "Violin density requires one grouping field and one measured dimension.",
        );
      violin = {
        scale: config.violin.scale ?? "width",
        side: config.violin.side ?? "both",
      };
      if (!["width", "area", "count"].includes(violin.scale))
        throw Error("Violin scale must be width, area, or count.");
      if (!["both", "left", "right"].includes(violin.side))
        throw Error("Violin side must be both, left, or right.");
      center = own(
        groups.positions(list(config.by)[0]).ref.reshape([groupCount, 1]),
      );
    }
    const gaussian =
      (2 * Math.PI) ** (-dimensions / 2) / bandwidth.reduce((a, b) => a * b, 1);
    const rowCount = rows.length,
      groupTotal = groupCount;
    // Chunks of a power of two rows, at most about 4M kernel and weight entries each, and the
    // rows padded to whole chunks with rows of weight 0 (they add nothing): the kernels' shapes
    // depend on the chunk, not the row count, so a new row count compiles nothing (TODO 23.4).
    const chunk = Math.min(
      2 **
        Math.floor(
          Math.log2(Math.max(1, (1 << 22) / (totalPerGroup + groupTotal))),
        ),
      2 ** Math.ceil(Math.log2(Math.max(1, rowCount))),
    );
    const n = Math.ceil(rowCount / chunk) * chunk;
    // A violin's groups are separated by a missing row (preserving both tail samples); the layout
    // is group-major, each group's rows then (but after the last) its separator.
    const separated = Boolean(config.violin) && groupTotal > 1;
    // The GPU is waited on only to bound what the queued chunks hold (TODO 26.3): each chunk's
    // kernel block is up to ~16 MB. Waiting after every chunk (and then yielding to a timer, which
    // browsers clamp to 4 ms once nested) cost a GPU round trip per chunk: 8 per brush move over
    // 60,000 rows.
    const chunkBytes = 4 * chunk * (totalPerGroup + groupTotal),
      budget = 64 * 2 ** 20;
    // Bounds and bandwidths follow the data: they reach the programs from a buffer, so another
    // extent compiles nothing new (TODO 17.1).
    const params = own(
      array([
        bounds.x[1] - bounds.x[0],
        bounds.x[0],
        dimensions === 2 ? bounds.y[1] - bounds.y[0] : 1,
        dimensions === 2 ? bounds.y[0] : 0,
        bandwidth[0] ** 2,
        dimensions === 2 ? bandwidth[1] ** 2 : 1,
        gaussian,
        (config.violin?.width ?? 0.8) * 0.5,
      ]),
    );
    const by = list(config.by);
    const spec = {
      two: dimensions === 2,
      grouped: Boolean(groups),
      counted: Boolean(input.masked && groups),
      resolution,
      groups: groupTotal,
      separated,
      counts: config.normalization === "count",
      violin,
      categorical: by.map((key) => Boolean(groups.keys[key].categories)),
    };
    const keys = () =>
      by.map((key) => (groups.keys[key].codes ?? groups.keys[key]).ref);
    const centers = () => (center ? center.ref : np.zeros([groupTotal, 1]));
    // The rows padded to whole chunks with rows of weight 0 (they add nothing).
    const padded = padRowsProgram(
      x.ref,
      (y ?? x).ref,
      weight.ref,
      finite.ref,
      groups ? groups.codes.ref : np.zeros([rowCount], { dtype: np.int32 }),
      shown
        ? shown.ref.astype(np.float32)
        : np.ones([rowCount], { dtype: np.float32 }),
      n,
    ).map(own);
    let out;
    if (!groupTotal)
      out = finishKernel(
        spec,
        np.zeros([totalPerGroup, 0]),
        np.zeros([0]),
        spec.counted ? np.zeros([0]) : null,
        params.ref,
        centers(),
        keys(),
      );
    else if (rowCount * totalPerGroup > densityPaths.binnedAbove) {
      // Rows counted onto a fine grid and smoothed (TODO 134.20): the work is rows + grid, not
      // rows x grid. Group weights and shown rows still count every row.
      const axes = binnedGrid(
        resolution,
        [bounds.x, ...(dimensions === 2 ? [bounds.y] : [])],
        bandwidth,
        groupTotal,
      );
      const grid = own(
        array(
          axes
            .flatMap(({ lo, step }) => [lo, step])
            .concat(dimensions === 2 ? [] : [0, 1]),
        ),
      );
      const [xs, ys, rowWeight, codes, shownRows] = padded;
      const totals = binnedProgram(
        spec,
        axes.map((a) => a.bins),
        config.weight !== undefined,
      )(
        xs.ref,
        ys.ref,
        rowWeight.ref,
        codes.ref,
        shownRows.ref,
        params.ref,
        grid.ref,
      );
      out = totals.present
        ? finishProgram(spec)(
            totals.sums,
            totals.groupWeight,
            totals.present,
            params.ref,
            centers(),
            keys(),
          )
        : finishProgram(spec)(
            totals.sums,
            totals.groupWeight,
            params.ref,
            centers(),
            keys(),
          );
    } else if (densityPaths.compiled && n === chunk) {
      // Every row in one chunk (interactive sizes): the whole estimate as one compiled program
      // (TODO 33.3).
      out = singleChunkProgram(spec)(
        ...padded.map((a) => a.ref),
        params.ref,
        centers(),
        keys(),
      );
    } else {
      // Every group's density in one pass over the rows (TODO 17.14b): density[q, g] is the sum over
      // rows r of kernel(q, r) x weight(r, g), a [queries x rows] kernel block times a [rows x
      // groups] weight block (a row's weight in its own group's column, 0 elsewhere and for hidden
      // or missing rows), accumulated over fixed-size row chunks, each a compiled program (one
      // program for several chunks compiled per chunk count: their running sum fused into the last
      // product). Before, every group evaluated the kernel over every row: [queries x rows]
      // intermediates per group, ~5 GB a brush drag for a violin over 100,000 rows.
      const [xs, ys, rowWeight, codes, shownRows] = padded;
      const grid = gridProgram(spec)(params.ref);
      Object.values(grid).forEach(own);
      // Running totals (each step consumes the last): the sums, each group's weight and, over a
      // padded input, its shown rows.
      let sums = np.zeros([totalPerGroup, groupTotal]),
        groupWeight = np.zeros([groupTotal]);
      let present = spec.counted ? np.zeros([groupTotal]) : null;
      let queued = 0;
      try {
        for (let from = 0; from < n; from += chunk) {
          abort(signal);
          const to = from + chunk;
          /** @type {DensityChunkInputs} */
          const inputs = {
            xGrid: grid.xGrid.ref,
            xRows: xs.ref,
            xVariance: grid.xVariance.ref,
            ...(spec.two
              ? {
                  yGrid: grid.yGrid.ref,
                  yRows: ys.ref,
                  yVariance: grid.yVariance.ref,
                }
              : {}),
            rowWeight: rowWeight.ref,
            ...(groups
              ? { codes: codes.ref, groupIds: grid.groupIds.ref }
              : {}),
            ...(present ? { shownRows: shownRows.ref, present } : {}),
            sums,
            groupWeight,
          };
          const totals = chunkProgram(spec.two, spec.grouped, spec.counted)(
            inputs,
            from,
            chunk,
          );
          sums = totals.sums;
          groupWeight = totals.groupWeight;
          if (present) present = totals.present;
          queued += chunkBytes;
          if (queued >= budget && to < n) {
            await sums.blockUntilReady();
            queued = 0;
          }
        }
      } catch (error) {
        [sums, groupWeight, present].forEach((a) => a?.dispose());
        throw error;
      }
      out = present
        ? finishProgram(spec)(
            sums,
            groupWeight,
            present,
            params.ref,
            centers(),
            keys(),
          )
        : finishProgram(spec)(sums, groupWeight, params.ref, centers(), keys());
    }
    const columns = {
      x: own(out.x),
      ...(out.y ? { y: own(out.y) } : {}),
      density: own(out.density),
    };
    if (violin) {
      columns.__violinLower = own(out.lower);
      columns.__violinUpper = own(out.upper);
    }
    // The group keys, repeated over each group's rows (and its separator).
    by.forEach((key, k) => {
      const value = groups.keys[key],
        repeated = own(out.keys[k]);
      columns[key] = value.categories
        ? { codes: repeated, categories: value.categories }
        : repeated;
    });
    // Groups with no shown row (and the separators around them) are hidden.
    const mask = out.mask ?? null;
    const count = out.count ? await scalar(out.count) : undefined;
    return {
      columns,
      valid: mask && own(mask),
      count,
      provenance: { kind: "density", fields: [...list(config.by), "density"] },
      grid:
        dimensions === 2
          ? await densityGrid(config, bounds, resolution, groups, by)
          : undefined,
      topology: `density:${JSON.stringify([resolution, bounds, groupCount])}`,
    };
  }

  /**
   * A 2-D density's grid table (TODO 51): y then x (x fastest, as the queries are laid out), with a
   * leading dimension of the groups for one `by` key (its values, in the output's group order).
   * Several keys give no grid: their combinations are not one dimension. undefined for none.
   */
  async function densityGrid(config, bounds, resolution, groups, by) {
    const x = "x",
      y = "y";
    const dims = [
      evenDimension(y, bounds.y, resolution[1]),
      evenDimension(x, bounds.x, resolution[0]),
    ];
    if (groups) {
      if (by.length !== 1 || !groups.count) return undefined;
      const key = groups.keys[by[0]],
        values = Array.from(await (key.codes ?? key).ref.data());
      const coords = key.categories
        ? values.map((code) => key.categories[code])
        : values;
      dims.unshift({
        name: by[0],
        coords,
        ...(key.categories
          ? { metadata: { type: "categorical", domain: coords } }
          : {}),
      });
    }
    try {
      return hm.grid({
        dims: Object.fromEntries(
          dims.map(({ name, coords }) => [name, coords]),
        ),
        edges: Object.fromEntries(
          dims
            .filter((dim) => dim.edges)
            .map(({ name, edges }) => [name, edges]),
        ),
      });
    } catch {
      // Keys that are not one ordered dimension (numbers out of order): no grid.
      return undefined;
    }
  }

  return async function run(input) {
    const config = {
      ...input.params,
      by: input.groups ? Object.keys(input.groups.keys) : undefined,
    };
    if (config.x === undefined) throw Error("Density requires an x column.");
    const dimensions = config.y === undefined ? 1 : 2,
      resolution = resolutionOf(config, dimensions);
    if (
      resolution.length !== dimensions ||
      resolution.some((value) => !Number.isInteger(value) || value < 2)
    )
      throw Error(
        "Density resolution needs an integer of at least two per dimension.",
      );
    const owned = [],
      own = (value) => (owned.push(value), value);
    let result;
    try {
      result = await estimateDensity(input, config, own);
      return result;
    } finally {
      // Return exactly one owned reference per published array and release every temporary.
      const retained = new Map();
      for (const value of [
        ...Object.values(result?.columns ?? {}),
        result?.valid,
      ]) {
        const array = value?.codes ?? value;
        if (array) retained.set(array, (retained.get(array) ?? 0) + 1);
      }
      for (const array of owned) {
        const keep = retained.get(array) ?? 0;
        if (keep) retained.set(array, keep - 1);
        else array.dispose();
      }
    }
  };
}

export default {
  name: "hmplot.density",
  apiVersion: 1,
  setup(hm) {
    hm.transform("Density", { ...density, run: createDensity(hm) });
  },
};
