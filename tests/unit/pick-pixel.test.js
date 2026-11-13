import test from "node:test";
import assert from "node:assert/strict";
import { pixelAt } from "../../src/lib/picking/pixel.js";

test("a pointer on a pixel's edge reads that pixel, through the NDC round trip", () => {
  for (const width of [523, 720, 1000, 1440, 1999])
    for (let px = 0; px < width; px++) {
      const ndc = (px / width) * 2 - 1;
      assert.equal(pixelAt(ndc * 0.5 + 0.5, width), px, `${px} of ${width}`);
      assert.equal(pixelAt(-(-ndc) * 0.5 + 0.5, width), px);
    }
  assert.equal(pixelAt(416 / 720, 720), 416);
  assert.equal(pixelAt(-0.2, 10), 0);
  assert.equal(pixelAt(1, 10), 9);
});
