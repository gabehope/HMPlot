// Component metadata for the bundled plug-in. Algorithms declare their numerical parameter schema.
export default [
  {
    kind: "Density",
    signature: {
      container: true,
      group: "Transforms",
      summary:
        "A kernel density estimate of one column (a smooth histogram), or of two on a grid (a density heatmap).",
      options: {
        name: {
          type: "string",
          doc: "Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.",
        },
        x: {
          type: "column",
          doc: "The column whose density to estimate; the output's x column holds the points it is evaluated at.",
          input: true,
        },
        y: {
          type: "column",
          doc: "A second column, for a 2D density: the output is a grid of x and y that a Heatmap draws.",
          input: true,
        },
        by: {
          type: "column | column[]",
          doc: "Estimate one density per group of these columns, on the same points; the output keeps these columns.",
          input: true,
        },
        weight: {
          type: "column",
          doc: "Nonnegative weights for the rows.",
          input: true,
        },
        resolution: {
          type: "number | [number, number] | expression",
          defaultText: "256 in 1D, [128, 128] in 2D",
          doc: "How many points to evaluate: a number, or [nx, ny] in 2D.",
        },
        bandwidth: {
          type: '"auto" | number | [number, number] | expression',
          default: "auto",
          units: "data units",
          doc: "The kernel's width: \"auto\" uses Scott's rule; a number ([bx, by] in 2D) or an expression such as `multiply(std(col.x), 0.3)` sets it.",
          input: true,
        },
        bounds: {
          type: "{x, y}",
          defaultText: "the data's extent and three bandwidths on each side",
          units: "data units",
          doc: "The range to evaluate over, as {x: [min, max], y: [min, max]}.",
        },
        normalization: {
          type: '"density" | "count"',
          default: "density",
          doc: 'What the density column holds: "density" integrates to 1 over each group; "count" integrates to its row count (or total weight).',
          input: true,
        },
        as: {
          type: "{x, y, density}",
          doc: "New names for the x, y and density columns.",
        },
      },
    },
    types: {
      name: "string",
      x: "string | RowNumbers",
      y: "string | RowNumbers",
      by: "ColumnName | ColumnName[]",
      weight: "ColumnName | RowNumbers",
      resolution: "number | [number, number] | Expression",
      bandwidth: '"auto" | number | [number, number] | Expression',
      bounds: "{ x: [number, number]; y?: [number, number] }",
      normalization: '"density" | "count"',
      as: "{ x?: string; y?: string; density?: string }",
    },
    required: ["x"],
    internal: {
      violin: {
        type: '{\n    scale?: "width" | "area" | "count";\n    width?: number;\n    side?: "both" | "left" | "right";\n    orientation?: "horizontal" | "vertical";\n  }',
        doc: "@internal Violin's composition: the groups are centered on their categories along x\n(along y when `orientation` is \"horizontal\"), in the frame's order. Not an option.",
      },
    },
    bindings: {
      resolution: null,
      bandwidth: "auto",
    },
  },
];
