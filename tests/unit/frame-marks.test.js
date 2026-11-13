import test from "node:test";
import assert from "node:assert/strict";
import { frameCompatibility, FRAME_SAFE } from "../../src/lib/plot/utils/frameMarks.js";

const kinds = ["Anchor", "Area", "Arrows3D", "ErrorBars", "Heatmap", "Image", "Text", "Line",
  "Prism", "Rect", "Area", "Points3D", "Points", "Segments", "Surface", "Text3D", "GeoJSON"];

test("every mark kind renders in plain and linear-range frames", () => {
  for (const kind of kinds) assert.equal(frameCompatibility(kind), "", kind);
});

test("per-vertex mapped marks support nonlinear and anchored frames", () => {
  for (const kind of FRAME_SAFE) {
    assert.equal(frameCompatibility(kind, { nonlinear: true }), "", kind);
    assert.equal(frameCompatibility(kind, { anchored: true }), "", kind);
  }
  for (const kind of ["Rect", "Prism", "Area", "ErrorBars"]) assert.ok(FRAME_SAFE.has(kind), kind);
});

test("an Anchor maps through every frame chain, like the marks connections draw", () => {
  assert.ok(FRAME_SAFE.has("Anchor"));
  assert.equal(frameCompatibility("Anchor", { nonlinear: true }), "");
  assert.equal(frameCompatibility("Anchor", { anchored: true }), "");
  assert.equal(frameCompatibility("Anchor", { nonlinear: true, anchored: true }), "");
  assert.equal(frameCompatibility("Line", { nestedCoordinates: "polar", anchored: true }), "");
  // Paths refine through the whole ordered chain at every nesting level.
  for (const kind of ["Line", "Segments", "Arrows3D"])
    for (const nestedCoordinates of ["polar", "spherical", "cartesian"])
      assert.equal(frameCompatibility(kind, { nestedCoordinates }), "", `${kind} ${nestedCoordinates}`);
  // Bands refine along and across, error bars along their interval; in a
  // spherical frame they are longitude/latitude pieces.
  for (const kind of ["Area", "ErrorBars"])
    for (const nestedCoordinates of ["polar", "cartesian", "spherical"])
      assert.equal(frameCompatibility(kind, { nestedCoordinates }), "", `${kind} ${nestedCoordinates}`);
  // A Rect refines as a patch where the chain bends it; in a spherical frame it
  // is a longitude/latitude box.
  for (const nestedCoordinates of ["polar", "cartesian", "spherical"]) {
    assert.equal(frameCompatibility("Rect", { nestedCoordinates }), "", nestedCoordinates);
    assert.equal(frameCompatibility("Rect", { nestedCoordinates, anchored: true }), "", nestedCoordinates);
  }
  // A solid Prism is not a patch; a flat 2D rectangle Prism (a Bar) is.
  assert.match(frameCompatibility("Prism", { nestedCoordinates: "polar" }), /nested polar Frame/);
  assert.equal(frameCompatibility("Prism", { nestedCoordinates: "cartesian", flat: true }), "");
  assert.equal(frameCompatibility("Prism", { nestedCoordinates: "spherical", flat: true }), "");
  // GeoJSON maps through its own projection only; a nested override is diagnosed.
  for (const nestedCoordinates of ["spherical", "cartesian"])
    assert.match(frameCompatibility("GeoJSON", { nestedCoordinates }), /GeoJSON inside a nested/);
  assert.equal(frameCompatibility("Text", { nestedCoordinates: "polar", anchored: true }), "");
  assert.equal(frameCompatibility("Anchor", { nestedCoordinates: "polar" }), "");
  assert.equal(frameCompatibility("Text", { nestedCoordinates: "spherical", anchored: true }), "");
});

test("Text3D is a label mark: they follow nonlinear, anchored and nested frames", () => {
  for (const kind of ["Text3D"]) {
    assert.equal(frameCompatibility(kind, { nonlinear: true }), "");
    assert.equal(frameCompatibility(kind, { anchored: true }), "");
    for (const nestedCoordinates of ["polar", "spherical", "cartesian"])
      assert.equal(frameCompatibility(kind, { nestedCoordinates }), "", `${kind} ${nestedCoordinates}`);
  }
});

test("texture and mesh-space marks name the unsupported frame kind", () => {
  for (const kind of ["Surface", "GeoJSON"]) {
    assert.match(frameCompatibility(kind, { nonlinear: true }), /does not support nonlinear Frames/);
    assert.match(frameCompatibility(kind, { anchored: true }), /does not support anchored Frames/);
  }
  assert.match(frameCompatibility("Surface", { nonlinear: true }), /^Surface renders in texture or mesh space/);
  assert.match(frameCompatibility("GeoJSON", { nonlinear: true }), /^GeoJSON triangulates its features in data space/);
});

test("a 2D Heatmap or Image maps its grid through bending, placed and nested polar chains", () => {
  for (const kind of ["Heatmap", "Image"]) {
    assert.equal(frameCompatibility(kind, { nonlinear: true }), "", kind);
    assert.equal(frameCompatibility(kind, { anchored: true }), "", kind);
    for (const nestedCoordinates of ["polar", "cartesian"])
      assert.equal(frameCompatibility(kind, { nestedCoordinates }), "", `${kind} ${nestedCoordinates}`);
    // An orthographic ancestor followed by affine operations cuts at its
    // horizon; its own spherical frame, a flat map's seam or a globe would
    // need cuts inside the texture.
    assert.equal(frameCompatibility(kind, { nestedCoordinates: "cartesian", spherical: "horizon" }), "", kind);
    assert.match(frameCompatibility(kind, { nestedCoordinates: "spherical" }), /under a nested spherical Frame/);
    // Its own nested spherical frame works under affine ancestors (a globe or map inset).
    assert.equal(frameCompatibility(kind, { nestedCoordinates: "spherical", affine: true }), "", kind);
    assert.match(frameCompatibility(kind, { nestedCoordinates: "cartesian", spherical: "other" }), /under a nested spherical Frame/);
  }
});
