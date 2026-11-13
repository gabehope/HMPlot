import { numpy as np, jit, lax } from "@hmplot/jax";
import { deviceArray } from "./deviceParams.js";

/** Cached structural arrays; numeric geometry is a JIT program, with no coordinate
 * readback. Sibling order and levels are prepared once when the hierarchy changes. */
export function treeKernel({ parent, child, depth, root }, config) {
  const n = parent.length,
    mode = config.mode,
    direction = config.orientation ?? "down";
  const children = child.flat(),
    starts = [],
    ends = [];
  let at = 0;
  for (const members of child) {
    starts.push(at);
    at += members.length;
    ends.push(at);
  }
  const arrays = [
    parent.map((i, node) => (i < 0 ? node : i)),
    depth,
    children.length ? children : [root],
    starts,
    ends,
  ].map((values) => deviceArray(values, { dtype: "int32" }));
  const maxDepth = depth.reduce((a, b) => Math.max(a, b), 0),
    leaf = child.map((members) => !members.length);
  const order = [],
    stack = [root];
  while (stack.length) {
    const node = stack.pop();
    order.push(node);
    for (let i = child[node].length - 1; i >= 0; i--)
      stack.push(child[node][i]);
  }
  const leaves = order.filter((node) => leaf[node]),
    begin = Array(n).fill(0),
    end = Array(n).fill(0);
  leaves.forEach((node, i) => {
    begin[node] = i;
    end[node] = i + 1;
  });
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    if (child[node].length) {
      begin[node] = begin[child[node][0]];
      end[node] = end[child[node].at(-1)];
    }
  }
  arrays.push(
    ...[leaves, begin, end].map((values) =>
      deviceArray(values, { dtype: "int32" }),
    ),
  );
  const jumps = [];
  // Roots terminate at themselves. Clamping a missing parent to row zero creates a
  // cycle when rerooting at a different row whose subtree includes row zero.
  let ancestors = parent.map((i, node) => (i < 0 ? node : i));
  for (let step = 1; step < maxDepth; step *= 2) {
    jumps.push(ancestors);
    ancestors = ancestors.map((i) => ancestors[i]);
  }
  arrays.push(
    ...jumps.map((values) => deviceArray(values, { dtype: "int32" })),
  );
  const program = jit(
    (
      width,
      height,
      length,
      params,
      parents,
      levels,
      kids,
      first,
      last,
      leafIds,
      begin,
      end,
      ...jumps
    ) => {
      const sibling = params.ref.slice(0),
        spacing = params.ref.slice(1),
        margin = params.ref.slice(2);
      let span, left;
      const proportional = mode === "partition" && config.widthMode !== "fixed";
      if (proportional) {
        const prefix = np.concatenate([
          np.zeros([1]),
          np.cumsum(np.take(width.ref, leafIds.ref, 0)),
        ]);
        left = np.take(prefix.ref, begin.ref, 0);
        span = np.take(prefix, end.ref, 0).sub(left.ref);
      } else {
        span = width.ref;
        for (let level = maxDepth - 1; level >= 0; level--) {
          const sum = lax.scatter(
            np.where(levels.ref.greater(0), span.ref, 0),
            parents.ref,
            [n],
            { mode: "add" },
          );
          span = np.where(
            levels.ref.equal(level),
            np.maximum(width.ref, sum),
            span,
          );
        }
        const ordered = np.take(span.ref, kids.ref, 0),
          prefix = np.concatenate([np.zeros([1]), np.cumsum(ordered)]);
        const used = np
          .take(prefix.ref, last.ref, 0)
          .sub(np.take(prefix.ref, first.ref, 0));
        const before = np.take(
          prefix.ref,
          np.arange(kids.shape[0]).astype(np.int32),
          0,
        );
        const groupStarts = np.take(
          first.ref,
          np.take(parents.ref, kids.ref, 0),
          0,
        );
        const relative = lax.scatter(
          before.sub(np.take(prefix.ref, groupStarts, 0)),
          kids.ref,
          [n],
        );
        const align =
          config.childAlign === "left"
            ? 0
            : config.childAlign === "right"
              ? 1
              : 0.5;
        const padding = np.take(span.ref.sub(used).mul(align), parents.ref, 0);
        left = np.where(levels.ref.greater(0), relative.add(padding), 0);
      }
      const step =
        mode === "partition"
          ? np.take(height.ref, parents.ref, 0)
          : length.ref.mul(spacing.ref);
      let along = np.where(levels.ref.greater(0), step, 0);
      // Pointer jumping sums root paths in logarithmically many passes, including long chains.
      for (const ancestors of jumps) {
        along = along.ref.add(np.take(along, ancestors.ref, 0));
        if (!proportional) left = left.ref.add(np.take(left, ancestors.ref, 0));
      }
      let across = left.ref.add(span.ref.mul(0.5));
      if (mode !== "partition")
        across = across.sub(across.ref.slice(root)).mul(sibling.ref);
      const vertical =
        mode === "partition" ? along.ref.add(height.ref.mul(0.5)) : along.ref;
      const horizontal = direction === "left" || direction === "right";
      const sign = direction === "down" || direction === "left" ? -1 : 1;
      const rawX = horizontal ? vertical.ref.mul(sign) : across.ref;
      const rawY = horizontal ? across.ref : vertical.ref.mul(sign);
      const x = np.where(rawX.ref.equal(0), 0, rawX),
        y = np.where(rawY.ref.equal(0), 0, rawY);
      if (mode !== "partition") return [x, y];
      const a = horizontal ? along.ref.mul(sign) : left.ref;
      const b = horizontal
        ? along.ref.add(height.ref).mul(sign)
        : left.ref.add(span.ref);
      const c = horizontal ? left.ref : along.ref.mul(sign);
      const d = horizontal
        ? left.ref.add(span.ref)
        : along.ref.add(height.ref).mul(sign);
      const insetX = np.minimum(
        margin.ref.mul(0.5),
        np.abs(b.ref.sub(a.ref)).mul(0.5),
      );
      const insetY = np.minimum(
        margin.ref.mul(0.5),
        np.abs(d.ref.sub(c.ref)).mul(0.5),
      );
      return [
        x,
        y,
        np.minimum(a.ref, b.ref).add(insetX.ref),
        np.maximum(a, b).sub(insetX),
        np.minimum(c.ref, d.ref).add(insetY.ref),
        np.maximum(c, d).sub(insetY),
      ];
    },
  );
  return {
    run(width, height, length, values = config) {
      const params = deviceArray([
        values.siblingSpacing ?? 1,
        values.depthSpacing ?? 1,
        values.visualMargin ?? 0,
      ]);
      try {
        return program(
          width.ref,
          height.ref,
          length.ref,
          params.ref,
          ...arrays.map((a) => a.ref),
        );
      } finally {
        params.dispose();
      }
    },
    dispose() {
      arrays.forEach((a) => a.dispose());
      program.dispose?.();
    },
  };
}
