/** Seeded graph generation for the large-graph example (TODO 138.7).
 * Ordinary host arrays cross the same graph publication contract as external plugins.
 */
export default {
  name: "hmplot.community-graph",
  apiVersion: 1,
  setup(hm) {
    hm.transform("community-graph", {
      reads: "rows",
      output: "graph",
      parameters: {
        nodes: {
          type: "number",
          integer: true,
          min: 1,
          max: 100000,
          default: 512,
        },
        seed: {
          type: "number",
          integer: true,
          min: 0,
          max: 4294967295,
          default: 42,
        },
      },
      async run({ params, signal }) {
        const count = params.nodes,
          ids = new Int32Array(count);
        const source = new Int32Array(3 * count),
          target = new Int32Array(3 * count);
        let seed = params.seed;
        const random = () =>
          (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
        for (let row = 0; row < count; row++) {
          if (row % 16384 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (signal?.aborted)
              throw new DOMException("Canceled", "AbortError");
          }
          ids[row] = row;
          source.fill(row, 3 * row, 3 * row + 3);
          target[3 * row] = (row + 1) % count;
          target[3 * row + 1] =
            (Math.floor(row / 32) * 32 + Math.floor(random() * 32)) % count;
          target[3 * row + 2] = Math.floor(random() * count);
        }
        return {
          nodes: { columns: { id: ids } },
          edges: { columns: { source, target } },
        };
      },
    });
  },
};
