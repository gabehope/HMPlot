// Component metadata for the bundled plug-in. Algorithms declare their numerical parameter schema.
export default [
  {
    kind: "Regression",
    signature: {
      container: true,
      group: "Transforms",
      summary:
        "A least-squares fit of y on x, sampled across x, with its confidence band.",
      options: {
        name: {
          type: "string",
          doc: "Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.",
        },
        x: {
          type: "column",
          doc: "The column y is fitted on; the output's `x` holds `samples` positions across its range.",
          input: true,
        },
        y: {
          type: "column",
          doc: "The column fitted; the output's `y` is the fitted curve.",
          input: true,
        },
        method: {
          type: '"linear" | "poly" | "log" | "exp" | "pow"',
          default: "linear",
          doc: "The model: a line, a polynomial of `order`, y on ln x, ln y on x, or ln y on ln x. The log models leave out rows at zero or below, with a warning.",
          input: true,
        },
        order: {
          type: "number",
          default: 2,
          doc: 'The polynomial\'s degree, 1 to 6, with method "poly".',
        },
        samples: {
          type: "number",
          default: 100,
          doc: "How many output rows, evenly spaced across `extent`.",
        },
        extent: {
          type: "[number, number]",
          defaultText: "the fitted rows' x range",
          units: "data units",
          doc: "The x range the fit is sampled over.",
        },
        band: {
          type: "number | false",
          default: 0.95,
          doc: "The confidence level of the band around the fitted mean, in the `lower` and `upper` columns (Student's t); false for none, which leaves both columns missing.",
        },
        as: {
          type: "{x, y, lower, upper}",
          doc: "New names for the output columns `x`, `y`, `lower` and `upper`.",
        },
      },
    },
    types: {
      name: "string",
      x: "string | RowNumbers",
      y: "string | RowNumbers",
      method: '"linear" | "poly" | "log" | "exp" | "pow"',
      order: "number",
      samples: "number",
      extent: "[number, number]",
      band: "number | false",
      as: "{ x?: string; y?: string; lower?: string; upper?: string }",
    },
    required: ["x", "y"],
    inspect: {
      method: "fit",
      type: "RegressionFit",
      doc: "The displayed fit, read from the device after the transform settles; null before its first run.",
    },
  },
];
