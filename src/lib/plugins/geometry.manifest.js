// Component metadata for the bundled plug-in. Algorithms declare their numerical parameter schema.
export default [
  {
    kind: "Delaunay",
    signature: {
      container: true,
      group: "Transforms",
      summary: "The Delaunay triangulation of points, as edges for Segments.",
      options: {
        name: {
          type: "string",
          doc: "Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.",
        },
        x: {
          type: "column",
          doc: "The points' x column. Each output row is an edge from `start` to `end`, between the rows numbered `source` and `target`.",
          input: true,
        },
        y: {
          type: "column",
          doc: "The points' y column.",
          input: true,
        },
      },
    },
    types: {
      name: "string",
      x: "string",
      y: "string",
    },
    required: ["x", "y"],
  },
  {
    kind: "Voronoi",
    signature: {
      container: true,
      group: "Transforms",
      summary: "Each point's Voronoi cell, as triangles for Polygon.",
      options: {
        name: {
          type: "string",
          doc: "Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.",
        },
        x: {
          type: "column",
          doc: "The points' x column. Each cell carries its point's row: its columns, and its identity for hover and selection.",
          input: true,
        },
        y: {
          type: "column",
          doc: "The points' y column.",
          input: true,
        },
        extent: {
          type: "[[number, number], [number, number]]",
          defaultText: "the points' bounds, widened by a tenth of their size",
          units: "data units",
          doc: "The rectangle the cells are clipped to, [[x0, y0], [x1, y1]].",
        },
      },
    },
    types: {
      name: "string",
      x: "string",
      y: "string",
      extent: "[[number, number], [number, number]]",
    },
    required: ["x", "y"],
  },
  {
    kind: "Hull",
    signature: {
      container: true,
      group: "Transforms",
      summary:
        "The convex hull around points, one per group, as triangles for Polygon.",
      options: {
        name: {
          type: "string",
          doc: "Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.",
        },
        x: {
          type: "column",
          doc: "The points' x column.",
          input: true,
        },
        y: {
          type: "column",
          doc: "The points' y column.",
          input: true,
        },
        by: {
          type: "column | column[]",
          doc: "Groups, a hull each, carrying the group's first row (one hull around every point without it).",
          input: true,
        },
      },
    },
    types: {
      name: "string",
      x: "string",
      y: "string",
      by: "string | string[]",
    },
    required: ["x", "y"],
  },
];
