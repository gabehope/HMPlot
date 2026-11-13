import test from "node:test";
import assert from "node:assert/strict";
import { initializePlot } from "../../src/lib/jaxExtensions/setup.js";

test("library initialization is lazy and rejects explicit server-side GPU setup", async () => {
  assert.equal(typeof window, "undefined");
  await assert.rejects(initializePlot(), /requires a browser/);
  // A failed server call must not poison later initialization attempts.
  await assert.rejects(initializePlot(), /requires a browser/);
});
