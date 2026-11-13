import { ticks, nice } from "d3";

export const CONTOUR_PARAMETERS = {
  field: { type: "field" },
  thresholds: {
    type: "union",
    variants: [
      { type: "number", integer: true, min: 1, max: 1000 },
      { type: "array", items: { type: "number" }, minLength: 1 },
    ],
    default: 10,
  },
  mode: { type: "select", options: ["lines", "bands"], default: "lines" },
  x: { type: "string" },
  y: { type: "string" },
};

export const contour = {
  reads: "grid",
  output: "newRows",
  parameters: CONTOUR_PARAMETERS,
};

export default {
  name: "hmplot.contour",
  apiVersion: 1,
  setup(hm) {
    const { numpy: np, jit } = hm.jax;
    const scalar = async (value) => Number((await value.data())[0]);
    /**
     * Contour (TODO 47.5): iso-lines or filled bands of a grid table's field (a Density's or a
     * Interpolate's output, or any grid table: a NetCDF field), on the GPU.
     *
     * Lines are marching squares as d3-contour draws them: the same case table (a saddle keeps the
     * corners at or above the level apart) and the same crossings, linear along each cell edge, so the
     * segments are d3's (without the ones along the grid's border that close d3's rings). Output: a
     * row per segment, `start` and `end` ([n, 2], in the grid's coordinates) and `level`.
     *
     * Bands are the regions between consecutive levels, and above the last: each cell is four
     * triangles around its centre, whose value is the mean of the cell's corners (so a saddle is
     * resolved by the mean), and each triangle, linear inside, is clipped to each band it meets: a
     * convex piece of at most five corners, drawn as a fan. Output: Polygon's triangle rows
     * (`__corner0` to `__corner2`, `__edges`) with `lower` and `upper` (the band's levels; the
     * grid's largest value above the last) and `band` (its index from 0).
     *
     * Output rows are sized exactly: a count per cell and level (per triangle and band), a prefix
     * sum, one readback of the total, and a binary search from each output row back to its source.
     * Missing values and a Filter's hidden cells draw nothing.
     */

    // d3-contour's case table as edges of a cell: 0 bottom (t3-t2), 1 right (t2-t1), 2 top (t0-t1),
    // 3 left (t3-t0), with the corners t0 (x, y+1), t1 (x+1, y+1), t2 (x+1, y), t3 (x, y).
    const CASES = [
      [],
      [[2, 3]],
      [[1, 2]],
      [[1, 3]],
      [[0, 1]],
      [
        [2, 3],
        [0, 1],
      ],
      [[0, 2]],
      [[0, 3]],
      [[3, 0]],
      [[2, 0]],
      [
        [3, 0],
        [1, 2],
      ],
      [[1, 0]],
      [[3, 1]],
      [[2, 1]],
      [[3, 2]],
      [],
    ];
    const SEGMENT_TABLE = CASES.flatMap((segments) =>
      [0, 1].flatMap((s) => segments[s] ?? [-1, -1]),
    );

    /** Inclusive prefix sums of `values` ([n]) in log2(n) shifted passes. Consumes values. */
    function prefixSum(values) {
      const n = values.shape[0];
      let sums = values;
      for (let step = 1; step < n; step *= 2)
        sums = sums.ref.add(
          np.concatenate([np.zeros([step]), sums.slice([0, n - step])]),
        );
      return sums;
    }

    /** How many of `sorted` ([m], ascending) are at or below each query ([q]). Borrows sorted, consumes queries. */
    function countAtOrBelow(sorted, queries) {
      const m = sorted.shape[0],
        q = queries.shape[0];
      let lo = np.zeros([q]),
        hi = np.full([q], m);
      for (let span = m; span > 0; span = Math.floor(span / 2)) {
        const mid = np.floor(lo.ref.add(hi.ref).mul(0.5));
        const value = np.take(
          sorted.ref,
          np.clip(mid.ref, 0, Math.max(0, m - 1)).astype(np.int32),
          0,
        );
        const active = lo.ref.less(hi.ref);
        const atOrBelow = np.logicalAnd(
          active.ref,
          value.lessEqual(queries.ref),
        );
        const above = np.logicalAnd(active, np.logicalNot(atOrBelow.ref));
        lo = np.where(atOrBelow, mid.ref.add(1), lo);
        hi = np.where(above, mid, hi);
      }
      hi.dispose();
      queries.dispose();
      return lo;
    }

    const prefixProgram = jit((counts) => prefixSum(counts.astype(np.float32)));
    const expandProgram = jit((inclusive, counts, rows) => {
      const exclusive = inclusive.sub(counts.astype(np.float32));
      const owner = countAtOrBelow(exclusive, rows.ref.add(0.5)).sub(1);
      const start = np.take(exclusive, owner.ref.astype(np.int32), 0);
      return [owner.astype(np.int32), rows.sub(start).astype(np.int32)];
    });
    /**
     * The rows `counts` ([n], small non-negative integers) make: { total, owner, rank }, each row's
     * entry and its place among that entry's rows. One readback (the total). Consumes counts.
     */
    async function expand(counts, maxBytes, bytesPerRow) {
      let inclusive;
      try {
        const n = counts.shape[0];
        if (!n) return { total: 0, owner: null, rank: null };
        inclusive = prefixProgram(counts.ref);
        const total = Math.round(
          await scalar(inclusive.ref.slice([n - 1, n]).reshape([])),
        );
        if (!total) return { total: 0, owner: null, rank: null };
        if (total * bytesPerRow > maxBytes)
          throw Error(
            "Contour: geometry exceeds the GPU storage-buffer limit; use fewer levels or cells.",
          );
        const [owner, rank] = expandProgram(
          inclusive.ref,
          counts.ref,
          np.arange(total).astype(np.float32),
        );
        return { total, owner, rank };
      } finally {
        inclusive?.dispose();
        counts.dispose();
      }
    }

    const definition = {
      ...contour,
      outputs: (config) =>
        ((config.mode ?? "lines") === "bands"
          ? ["lower", "upper"]
          : ["level"]
        ).map((name) => ({ name, type: "numeric", source: config.field })),
      async run({ params: config, grid, array, maxBytes, signal }) {
        if (typeof config.field !== "string" || !config.field)
          throw Error("Contour: pass field, the grid column to contour.");
        const owned = [],
          own = (value) => (owned.push(value), value);
        try {
          const result = await runContour(config, grid, array, maxBytes, own);
          if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
          return {
            ...result,
            columns: Object.fromEntries(
              Object.entries(result.columns).map(([key, value]) => [
                key,
                value.ref,
              ]),
            ),
          };
        } finally {
          owned.forEach((value) => value.dispose());
        }
      },
    };
    async function runContour(config, grid, array, maxBytes, own) {
      const bands = (config.mode ?? "lines") === "bands";
      if (!grid)
        throw Error(
          "Contour needs a grid table: a Density's or an Interpolate's output, gridTable(), or a NetCDF field.",
        );
      const layout = contourDimensions(grid, config.x, config.y);
      const others = grid.dims.filter(
        (dim, k) => k !== layout.rows && k !== layout.columns && dim.size > 1,
      );
      if (grid.dims.length < 2 || others.length)
        throw Error(
          `Contour draws two dimensions of a grid; this one is ${grid.dims.map((dim) => `${dim.name} (${dim.size})`).join(" × ")}.${others.length ? ` Slice the others first (Slice field="${others[0].name}").` : ""}`,
        );
      if (!grid.drawable(2))
        throw Error(
          "Contour needs two numerical grid dimensions; Slice extra dimensions first. Curvilinear grids are not supported.",
        );
      const ydim = grid.dims[layout.rows],
        xdim = grid.dims[layout.columns];
      for (const dim of [xdim, ydim])
        if (!(dim.coords instanceof Float64Array))
          throw Error(
            `Contour: ${dim.name} is categorical; contours need numeric coordinates.`,
          );
      const ny = ydim.size,
        nx = xdim.size,
        transposed = layout.columns < layout.rows;
      const values = grid.field(config.field);
      const field = own(
        transposed
          ? values.ref.reshape([nx, ny]).transpose([1, 0])
          : values.ref.reshape([ny, nx]),
      );
      // The levels: a list as given, or d3-contour's nice ticks over the finite values.
      let levels;
      if (Array.isArray(config.thresholds))
        levels = [...config.thresholds].sort((a, b) => a - b);
      else {
        const [lo, hi] = Array.from(
          await finiteExtent(field.ref).data(),
          Number,
        );
        const count = config.thresholds ?? 10;
        levels =
          Number.isFinite(lo) && Number.isFinite(hi)
            ? ticks(...nice(lo, hi, count), count)
            : [];
        while (levels.length && levels[levels.length - 1] >= hi) levels.pop();
        while (levels.length > 1 && levels[1] < lo) levels.shift();
      }
      const K = levels.length;
      if (!K || nx < 2 || ny < 2)
        return bands ? emptyBands(own) : emptyLines(own);
      const X = own(array(Float32Array.from(xdim.coords))),
        Y = own(array(Float32Array.from(ydim.coords)));
      const level = own(array(levels));
      if (!bands) {
        const { total, owner, rank } = await expand(
          segmentCounts(field.ref, level.ref, K),
          maxBytes,
          20,
        );
        if (!total) return emptyLines(own);
        own(owner);
        own(rank);
        const [start, end, at] = segments(
          field.ref,
          X.ref,
          Y.ref,
          level.ref,
          owner.ref,
          rank.ref,
          K,
        ).map(own);
        return {
          columns: { start, end, level: at },
          provenance: { kind: "contour", fields: ["level"] },
        };
      }
      // Bands: each triangle (four per cell) to the bands it meets, then each band's piece to its fan.
      const bounds = own(
        np.concatenate([level.ref, finiteExtent(field.ref).slice([1, 2])]),
      );
      const pairs = await expand(
        bandCounts(field.ref, level.ref),
        maxBytes,
        120,
      );
      if (!pairs.total) return emptyBands(own);
      own(pairs.owner);
      own(pairs.rank);
      const rows = await expand(
        pieceCounts(
          field.ref,
          X.ref,
          Y.ref,
          bounds.ref,
          pairs.owner.ref,
          pairs.rank.ref,
        ),
        maxBytes,
        40,
      );
      if (!rows.total) return emptyBands(own);
      own(rows.owner);
      own(rows.rank);
      const [corner0, corner1, corner2, lower, upper, band, edges] = pieces(
        field.ref,
        X.ref,
        Y.ref,
        bounds.ref,
        pairs.owner.ref,
        pairs.rank.ref,
        rows.owner.ref,
        rows.rank.ref,
      ).map(own);
      return {
        columns: {
          __corner0: corner0,
          __corner1: corner1,
          __corner2: corner2,
          __edges: edges,
          lower,
          upper,
          band,
        },
        geometry: "triangles",
        provenance: { kind: "contour", fields: ["lower", "upper", "band"] },
      };
    }

    const emptyLines = (own) => ({
      columns: {
        start: own(np.zeros([0, 2])),
        end: own(np.zeros([0, 2])),
        level: own(np.zeros([0])),
      },
    });
    const emptyBands = (own) => ({
      columns: {
        __corner0: own(np.zeros([0, 2])),
        __corner1: own(np.zeros([0, 2])),
        __corner2: own(np.zeros([0, 2])),
        __edges: own(np.zeros([0])),
        lower: own(np.zeros([0])),
        upper: own(np.zeros([0])),
        band: own(np.zeros([0])),
      },
      geometry: "triangles",
    });

    const finiteExtent = jit((v) => {
      const finite = np.isfinite(v.ref);
      return np.stack([
        np.min(np.where(finite.ref, v.ref, Infinity)),
        np.max(np.where(finite, v, -Infinity)),
      ]);
    });

    /** The corners of every cell, [C] each (cells row-major, i along y). Consumes v. */
    function cellCorners(v) {
      const [ny, nx] = v.shape;
      const c = (i0, j0) =>
        v.ref.slice([i0, i0 + ny - 1], [j0, j0 + nx - 1]).reshape([-1]);
      const out = { t3: c(0, 0), t2: c(0, 1), t1: c(1, 1), t0: c(1, 0) };
      v.dispose();
      return out;
    }
    /** Every cell's corner positions: { xa, xb, ya, yb } ([C] each: its left and right x, bottom and top y). Consumes X and Y. */
    function cellPositions(X, Y) {
      const nx = X.shape[0],
        ny = Y.shape[0],
        shape = [ny - 1, nx - 1];
      const across = (a) =>
        np.broadcastTo(a.reshape([1, nx - 1]), shape).reshape([-1]);
      const up = (a) =>
        np.broadcastTo(a.reshape([ny - 1, 1]), shape).reshape([-1]);
      const out = {
        xa: across(X.ref.slice([0, nx - 1])),
        xb: across(X.slice([1, nx])),
        ya: up(Y.ref.slice([0, ny - 1])),
        yb: up(Y.slice([1, ny])),
      };
      return out;
    }

    /** Segments per cell and level ([C * K], cell-major): 0, 1, or 2 at a saddle. Consumes its arguments. */
    const segmentCounts = jit((v, level) => {
      const K = level.shape[0];
      const { t0, t1, t2, t3 } = cellCorners(v);
      const finite = np.logicalAnd(
        np.logicalAnd(np.isfinite(t0.ref), np.isfinite(t1.ref)),
        np.logicalAnd(np.isfinite(t2.ref), np.isfinite(t3.ref)),
      );
      const at = (t) =>
        t
          .reshape([-1, 1])
          .greaterEqual(level.ref.reshape([1, K]))
          .astype(np.int32);
      const code = at(t0)
        .add(at(t1).mul(2))
        .add(at(t2).mul(4))
        .add(at(t3).mul(8));
      level.dispose();
      const none = np.logicalOr(code.ref.equal(0), code.ref.equal(15)),
        saddle = np.logicalOr(code.ref.equal(5), code.equal(10));
      const count = np.where(none, 0, np.where(saddle, 2, 1));
      return np
        .where(finite.reshape([-1, 1]), count, 0)
        .reshape([-1])
        .astype(np.int32);
    });

    /** Each segment's ends ([S, 2]) and level ([S]). Consumes its arguments. */
    function segments(v, X, Y, level, owner, rank, K) {
      return segmentProgram(
        v,
        X,
        Y,
        level,
        owner,
        rank,
        np.array(SEGMENT_TABLE, { dtype: np.int32 }),
      );
    }
    const segmentProgram = jit((v, X, Y, level, owner, rank, table) => {
      const K = level.shape[0],
        nx = X.shape[0];
      const pick = (index, parts) =>
        parts
          .slice(1)
          .reduce(
            (acc, part, n) => np.where(index.ref.equal(n + 1), part, acc),
            parts[0],
          );
      const ownerF = owner.astype(np.float32);
      const cell = np.floor(ownerF.ref.div(K)),
        k = ownerF.sub(cell.ref.mul(K)).astype(np.int32);
      const i = np.floor(cell.ref.div(nx - 1)),
        j = cell.sub(i.ref.mul(nx - 1));
      const [ii, jj] = [i.astype(np.int32), j.astype(np.int32)];
      const t = np.take(level, k, 0);
      const flat = v.reshape([-1]);
      const value = (di, dj) =>
        np.take(flat.ref, ii.ref.add(di).mul(nx).add(jj.ref.add(dj)), 0);
      const [t0, t1, t2, t3] = [
        value(1, 0),
        value(1, 1),
        value(0, 1),
        value(0, 0),
      ];
      flat.dispose();
      const above = (a) => a.ref.greaterEqual(t.ref).astype(np.int32);
      const code = above(t0)
        .add(above(t1).mul(2))
        .add(above(t2).mul(4))
        .add(above(t3).mul(8));
      // The segment's two edges: the case's rank-th pair.
      const edge = (end) =>
        np.take(table.ref, code.ref.mul(4).add(rank.ref.mul(2)).add(end), 0);
      const [e0, e1] = [edge(0), edge(1)];
      table.dispose();
      code.dispose();
      rank.dispose();
      const x0 = np.take(X.ref, jj.ref, 0),
        x1 = np.take(X, jj.add(1), 0),
        y0 = np.take(Y.ref, ii.ref, 0),
        y1 = np.take(Y, ii.add(1), 0);
      const crossing = (a, b, s) => a.ref.add(b.ref.sub(a.ref).mul(s));
      const fraction = (a, b) => t.ref.sub(a.ref).div(b.ref.sub(a.ref));
      // Edge 0: t3 (x0, y0) to t2 (x1, y0); 1: t2 to t1 (x1, y1); 2: t0 (x0, y1) to t1; 3: t3 to t0.
      const px = [
        crossing(x0, x1, fraction(t3, t2)),
        x1.ref,
        crossing(x0, x1, fraction(t0, t1)),
        x0.ref,
      ];
      const py = [
        y0.ref,
        crossing(y0, y1, fraction(t2, t1)),
        y1.ref,
        crossing(y0, y1, fraction(t3, t0)),
      ];
      for (const a of [t0, t1, t2, t3, x0, x1, y0, y1]) a.dispose();
      const point = (e) => {
        const p = np.stack(
          [
            pick(
              e,
              px.map((a) => a.ref),
            ),
            pick(
              e,
              py.map((a) => a.ref),
            ),
          ],
          1,
        );
        e.dispose();
        return p;
      };
      const start = point(e0),
        end = point(e1);
      for (const a of [...px, ...py]) a.dispose();
      return [start, end, t];
    });

    /**
     * The cell's four triangles ([T] each, T = 4C): corners a and b on the cell's border (bottom,
     * right, top, left in turn), c its centre, with their values. Consumes v, X and Y.
     */
    function cellTriangles(v, X, Y) {
      const { t0, t1, t2, t3 } = cellCorners(v);
      const { xa, xb, ya, yb } = cellPositions(X, Y);
      const cx = xa.ref.add(xb.ref).mul(0.5),
        cy = ya.ref.add(yb.ref).mul(0.5);
      const cv = t0.ref.add(t1.ref).add(t2.ref).add(t3.ref).mul(0.25);
      const P = { t3: [xa, ya], t2: [xb, ya], t1: [xb, yb], t0: [xa, yb] },
        V = { t3, t2, t1, t0 };
      const order = [
        ["t3", "t2"],
        ["t2", "t1"],
        ["t1", "t0"],
        ["t0", "t3"],
      ];
      const cat = (parts) => np.concatenate(parts.map((a) => a.ref));
      const out = {
        ax: cat(order.map(([a]) => P[a][0])),
        ay: cat(order.map(([a]) => P[a][1])),
        av: cat(order.map(([a]) => V[a])),
        bx: cat(order.map(([, b]) => P[b][0])),
        by: cat(order.map(([, b]) => P[b][1])),
        bv: cat(order.map(([, b]) => V[b])),
        cx: cat([cx, cx, cx, cx]),
        cy: cat([cy, cy, cy, cy]),
        cv: cat([cv, cv, cv, cv]),
      };
      for (const a of [xa, xb, ya, yb, cx, cy, cv, t0, t1, t2, t3]) a.dispose();
      return out;
    }
    /** The four triangles' values only ([T] each). Consumes v. */
    function triangleValues(v) {
      const { t0, t1, t2, t3 } = cellCorners(v);
      const cv = t0.ref.add(t1.ref).add(t2.ref).add(t3.ref).mul(0.25);
      const cat = (parts) => np.concatenate(parts.map((a) => a.ref));
      const out = {
        av: cat([t3, t2, t1, t0]),
        bv: cat([t2, t1, t0, t3]),
        cv: cat([cv, cv, cv, cv]),
      };
      for (const a of [t0, t1, t2, t3, cv]) a.dispose();
      return out;
    }

    /** The first band a triangle meets (at least band 0) and how many ([T] each). Consumes lo and hi, borrows level. */
    function bandSpan(level, lo, hi) {
      const finite = np.logicalAnd(np.isfinite(lo.ref), np.isfinite(hi.ref));
      const first = np.maximum(countAtOrBelow(level, lo).sub(1), 0),
        last = countAtOrBelow(level, hi).sub(1);
      const count = np.where(
        finite,
        np.maximum(last.sub(first.ref).add(1), 0),
        0,
      );
      return { first, count };
    }
    const extremes = (t) => ({
      lo: np.minimum(np.minimum(t.av.ref, t.bv.ref), t.cv.ref),
      hi: np.maximum(np.maximum(t.av.ref, t.bv.ref), t.cv.ref),
    });

    /** Bands each triangle meets ([T]). Consumes its arguments. */
    const bandCounts = jit((v, level) => {
      const t = triangleValues(v);
      const { lo, hi } = extremes(t);
      Object.values(t).forEach((a) => a.dispose());
      const { first, count } = bandSpan(level, lo, hi);
      first.dispose();
      level.dispose();
      return count.astype(np.int32);
    });

    /**
     * Each (triangle, band) pair's triangle (corners and values, [P] each) and its band: its index
     * and its lower and upper levels. `bounds` is the levels then the grid's largest value (the last
     * band's top). Consumes v, X, Y, bounds, owner and rank.
     */
    function pairTriangles(v, X, Y, bounds, owner, rank) {
      const K = bounds.shape[0] - 1;
      const t = cellTriangles(v, X, Y);
      const { lo, hi } = extremes(t);
      hi.dispose();
      const levels = bounds.ref.slice([0, K]);
      const first = np.maximum(countAtOrBelow(levels, lo).sub(1), 0);
      levels.dispose();
      const band = np
        .take(first, owner.ref, 0)
        .add(rank.astype(np.float32))
        .astype(np.int32);
      const picked = Object.fromEntries(
        Object.entries(t).map(([key, a]) => [key, np.take(a, owner.ref, 0)]),
      );
      owner.dispose();
      const lower = np.take(bounds.ref, band.ref, 0),
        upper = np.take(bounds, band.ref.add(1), 0);
      return { t: picked, band, lower, upper };
    }

    /**
     * The corners of a triangle clipped to its band, in order around it: for each edge (a-b, b-c,
     * c-a) its start when inside the band, then its crossings of the band's levels in the order met,
     * each with whether it exists. Nine candidates; the piece's corners are the ones that exist.
     * Borrows its arguments.
     */
    function clipCandidates(t, lower, upper, boundaries = false) {
      const corners = [
        [t.ax, t.ay, t.av],
        [t.bx, t.by, t.bv],
        [t.cx, t.cy, t.cv],
      ];
      const nonflat = boundaries
        ? np.logicalOr(t.av.ref.notEqual(t.bv.ref), t.av.ref.notEqual(t.cv.ref))
        : null;
      const candidates = [];
      for (let e = 0; e < 3; e++) {
        const [ax, ay, av] = corners[e],
          [bx, by, bv] = corners[(e + 1) % 3];
        candidates.push({
          x: ax.ref,
          y: ay.ref,
          ok: np.logicalAnd(
            av.ref.greaterEqual(lower.ref),
            av.ref.lessEqual(upper.ref),
          ),
          ...(boundaries
            ? {
                edge: np.where(
                  nonflat.ref,
                  np.where(
                    av.ref.equal(lower.ref),
                    1,
                    np.where(av.ref.equal(upper.ref), 2, 0),
                  ),
                  0,
                ),
              }
            : {}),
        });
        const cross = (level) => {
          const s = level.ref.sub(av.ref).div(bv.ref.sub(av.ref));
          return {
            s: s.ref,
            ok: np.logicalAnd(s.ref.greater(0), s.ref.less(1)),
            x: ax.ref.add(bx.ref.sub(ax.ref).mul(s.ref)),
            y: ay.ref.add(by.ref.sub(ay.ref).mul(s)),
          };
        };
        const a = cross(lower),
          b = cross(upper);
        const aFirst = a.s.lessEqual(b.s);
        candidates.push(
          {
            x: np.where(aFirst.ref, a.x.ref, b.x.ref),
            y: np.where(aFirst.ref, a.y.ref, b.y.ref),
            ok: np.where(aFirst.ref, a.ok.ref, b.ok.ref),
            ...(boundaries ? { edge: np.where(aFirst.ref, 1, 2) } : {}),
          },
          {
            x: np.where(aFirst.ref, b.x, a.x),
            y: np.where(aFirst.ref, b.y, a.y),
            ...(boundaries ? { edge: np.where(aFirst.ref, 2, 1) } : {}),
            ok: np.where(aFirst, b.ok, a.ok),
          },
        );
      }
      nonflat?.dispose();
      return candidates;
    }

    /** Corners of each pair's piece, less two: its fan's triangles ([P]). Consumes its arguments. */
    const pieceCounts = jit((v, X, Y, bounds, owner, rank) => {
      const { t, band, lower, upper } = pairTriangles(
        v,
        X,
        Y,
        bounds,
        owner,
        rank,
      );
      band.dispose();
      const candidates = clipCandidates(t, lower, upper);
      Object.values(t).forEach((a) => a.dispose());
      lower.dispose();
      upper.dispose();
      let count = null;
      for (const c of candidates) {
        c.x.dispose();
        c.y.dispose();
        const one = c.ok.astype(np.int32);
        count = count ? count.add(one) : one;
      }
      return np.maximum(count.sub(2), 0);
    });

    /** Each output triangle: the rank-th of its pair's fan (corners 0, rank + 1, rank + 2). Consumes its arguments. */
    const pieces = jit((v, X, Y, bounds, pairOwner, pairRank, owner, rank) => {
      const shape = rank.shape;
      const { t, band, lower, upper } = pairTriangles(
        v,
        X,
        Y,
        bounds,
        np.take(pairOwner, owner.ref, 0),
        np.take(pairRank, owner, 0),
      );
      const candidates = clipCandidates(t, lower, upper, true);
      Object.values(t).forEach((a) => a.dispose());
      // Each candidate's place among the ones that exist.
      let place = np.zeros(shape, { dtype: np.int32 });
      const places = candidates.map((c) => {
        const at = place.ref;
        place = place.add(c.ok.ref.astype(np.int32));
        return at;
      });
      place.dispose();
      const corner = (index) => {
        let x = np.full(shape, NaN),
          y = np.full(shape, NaN),
          edge = np.zeros(shape);
        candidates.forEach((c, n) => {
          const hit = np.logicalAnd(c.ok.ref, places[n].ref.equal(index.ref));
          x = np.where(hit.ref, c.x.ref, x);
          y = np.where(hit.ref, c.y.ref, y);
          edge = np.where(hit, c.edge.ref, edge);
        });
        index.dispose();
        return { position: np.stack([x, y], 1), edge };
      };
      const c0 = corner(np.zeros(shape, { dtype: np.int32 })),
        c1 = corner(rank.ref.add(1)),
        c2 = corner(rank.add(2));
      // Only endpoints on the same level form a contour boundary. Cell edges, centre spokes
      // and fan diagonals retain zero flags; plateau interiors have no boundary either.
      const boundary = (a, b) =>
        np.logicalAnd(a.ref.greater(0), a.ref.equal(b.ref)).astype(np.float32);
      const edges = boundary(c0.edge, c1.edge)
        .add(boundary(c1.edge, c2.edge).mul(2))
        .add(boundary(c2.edge, c0.edge).mul(4));
      for (const c of [c0, c1, c2]) c.edge.dispose();
      for (const c of candidates) {
        c.x.dispose();
        c.y.dispose();
        c.ok.dispose();
        c.edge.dispose();
      }
      places.forEach((a) => a.dispose());
      return [
        c0.position,
        c1.position,
        c2.position,
        lower,
        upper,
        band.astype(np.float32),
        edges,
      ];
    });

    function contourDimensions(grid, x, y) {
      const find = (name) => {
        const index = grid.dims.findIndex((dim) => dim.name === name);
        if (index < 0)
          throw Error(
            `Contour: ${name} is not a grid dimension; pass one of ${grid.dims.map((dim) => dim.name).join(", ")}.`,
          );
        return index;
      };
      let columns = x === undefined ? -1 : find(x),
        rows = y === undefined ? -1 : find(y);
      const active = grid.dims
        .map((dim, index) => (dim.size > 1 ? index : -1))
        .filter((index) => index >= 0);
      const pool =
        active.length >= 2 ? active : grid.dims.map((_, index) => index);
      if (rows < 0 && columns < 0) [rows, columns] = pool.slice(-2);
      else if (rows < 0)
        rows = [...pool].reverse().find((index) => index !== columns);
      else if (columns < 0)
        columns = [...pool].reverse().find((index) => index !== rows);
      if (rows === columns)
        throw Error("Contour: choose different x and y grid dimensions.");
      return { rows, columns };
    }

    hm.transform("Contour", definition);
  },
};
