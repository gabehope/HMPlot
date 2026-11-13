import test from "node:test";
import assert from "node:assert/strict";
import { light, readLights } from "../../src/lib/plot/utils/lights.js";

test("lights are plain specs with kind-specific, finite parameters", () => {
  const specs = [
    light("ambient", { intensity: 0.3 }),
    light("directional", { position: [1, 2, 3] }),
    light("hemisphere", { groundColor: "#000000" }),
    light("point", { intensity: 3, distance: 0, decay: 0 }),
  ];
  assert.deepEqual(readLights(JSON.parse(JSON.stringify(specs))), specs);
  assert.deepEqual(readLights(undefined), []);
  for (const value of [
    {},
    [null],
    [{ kind: "unknown" }],
    [{ kind: "ambient", position: [1, 2, 3] }],
    [{ kind: "point", position: [1, 2] }],
    [{ kind: "point", intensity: -1 }],
    [{ kind: "point", decay: NaN }],
    [{ kind: "hemisphere", groundColor: 3 }],
  ])
    assert.throws(() => readLights(value), /Plot\.lights/);
});
