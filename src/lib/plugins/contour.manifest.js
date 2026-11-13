// Component metadata for the bundled plug-in. Algorithms declare their numerical parameter schema.
export default [
  {
    kind: "Contour",
    signature: {
      container: true,
      group: "Transforms",
      summary:
        "Contour lines or filled bands of a grid, such as a 2-D density.",
      options: {
        name: {
          type: "string",
          doc: "Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.",
        },
        field: {
          type: "column",
          doc: "The grid table's column to contour (a Density's or an Interpolate's output, or a gridded dataset).",
          input: true,
        },
        thresholds: {
          type: "number | number[]",
          default: 10,
          doc: "The levels: a count of round values across the field's range (about that many), or the list of levels.",
        },
        mode: {
          type: '"lines" | "bands"',
          default: "lines",
          doc: '"lines" gives a row per segment (`start`, `end`, `level`) for Segments; "bands" gives the regions between levels as triangles (`lower`, `upper`, `band`) for Polygon.',
          input: true,
        },
        x: {
          type: "string",
          defaultText: "the grid's last dimension",
          doc: "The grid dimension on the x axis.",
          input: true,
        },
        y: {
          type: "string",
          defaultText: "the grid's second-to-last dimension",
          doc: "The grid dimension on the y axis.",
          input: true,
        },
      },
    },
    types: {
      name: "string",
      field: "string",
      thresholds: "number | number[]",
      mode: '"lines" | "bands"',
      x: "string",
      y: "string",
    },
    required: ["field"],
  },
];
