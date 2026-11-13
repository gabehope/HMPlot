import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  LIMITS,
  STRATEGIES,
  limitError,
} from "../../src/lib/plot/utils/limits.js";

// TODO 136.9: the capacity registry and its one error format.
test("every limit has a unit, a value, a strategy and a component; one that refuses has a hint", () => {
  for (const [name, limit] of Object.entries(LIMITS)) {
    assert.ok(limit.unit && limit.what && limit.component, name);
    assert.ok(
      STRATEGIES.includes(limit.strategy),
      `${name}: ${limit.strategy}`,
    );
    assert.ok(
      limit.value === "device" ||
        (Number.isInteger(limit.value) && limit.value > 0),
      name,
    );
    if (limit.strategy === "error")
      assert.ok(limit.hint, `${name} needs a hint`);
  }
});

test("a limit error names its component, the size, the limit and what to do", () => {
  const error = limitError("stackPairs", {
    count: 20_000_000,
    limit: 16_777_216,
  });
  assert.equal(
    error.message,
    "Stack: totaling every (x, series) pair needs 20,000,000 pairs; the limit is 16,777,216 pairs. Stack fewer x values or series.",
  );
  assert.equal(error.code, "limit.stackPairs");
  assert.equal(error.diagnostic.component, "Stack");
  assert.equal(
    limitError("storage", {
      component: "Bin",
      what: "its output",
      count: 300 * 1048576,
      limit: 128 * 1048576,
    }).message,
    "Bin: its output needs 300 MiB; the limit is 128 MiB on this device. Draw fewer rows, or coarser data.",
  );
  assert.equal(
    limitError("storage", { component: "Slice" }).message,
    "Slice: its data on the GPU is past this device's limit. Draw fewer rows, or coarser data.",
  );
  assert.equal(
    limitError("axisTicks").message,
    "Plot: an axis needs more than 4,096 ticks. Set a larger tick spacing.",
  );
  assert.throws(() => limitError("liveTiles"), /not a limit that refuses/);
});

test("docs/LIMITATIONS.md lists every limit with its value", () => {
  const doc = readFileSync(
    new URL("../../docs/LIMITATIONS.md", import.meta.url),
    "utf8",
  );
  for (const [name, limit] of Object.entries(LIMITS)) {
    const row = doc
      .split("\n")
      .find((line) => line.startsWith(`| \`limit.${name}\` |`));
    assert.ok(row, `docs/LIMITATIONS.md has no row for limit.${name}`);
    if (limit.value !== "device")
      assert.ok(row.includes(limit.value.toLocaleString("en-US")), row);
  }
});

// A limit's error goes through limitError: messages that say a size is past a limit, written
// anywhere else, are counted (src/lib/scene/widget.js's bridge message has its own code).
const AD_HOC =
  /(throw|Error\().*(exceeds? (the|its|device)|the limit is|budget|allocation limit|storage-buffer limit|device limit|Too many)/;
const files = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.(js|ts|svelte)$/.test(entry)
        ? [path]
        : [];
  });
test("limit errors are written only through limitError", () => {
  const root = new URL("../../src/lib", import.meta.url).pathname;
  const found = files(root)
    .filter((path) => !path.endsWith("utils/limits.js"))
    .flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => [path.slice(root.length + 1), index + 1, line])
        .filter(([, , line]) => AD_HOC.test(line)),
    )
    .map(([path, line]) => `${path}:${line}`);
  assert.deepEqual(found, []);
});

test("a shader's varyings take one location each, numbered without gaps", async () => {
  const { varyingLocations, compactLocations } =
    await import("../../src/lib/plot/rendering/varyingsCheck.js");
  const at = (...read) => ({
    varyings: read.map((needsInterpolation) => ({ needsInterpolation })),
  });
  assert.equal(varyingLocations(at()), 0);
  assert.equal(varyingLocations(at(false, true, false, true)), 2);
  // three numbers them by their index among every varying (TODO 136.9: Points reached 17).
  assert.equal(
    compactLocations(
      "@location( 4 ) a : f32,\n\t@location( 9 ) @interpolate(flat, either) b : u32",
    ),
    "@location( 0 ) a : f32,\n\t@location( 1 ) @interpolate(flat, either) b : u32",
  );
});

test("a limit error reported by a mark or transform names it when the site could not", async () => {
  const { attributed } = await import("../../src/lib/plot/utils/limits.js");
  const reduction = limitError("partitionGroups", {
    what: "partitioning by g",
    count: 2000,
  });
  assert.equal(
    attributed(reduction, "Points"),
    "Points: partitioning by g needs 2,000 groups; the limit is 256 groups. Raise Partition limit= if that is intended.",
  );
  assert.equal(reduction.diagnostic.component, "Points");
  const stack = limitError("stackInsideOut", {
    component: "Stack",
    count: 2000,
  });
  assert.equal(attributed(stack, "Stack"), stack.message, "named once");
  assert.equal(attributed(Error("a plain error"), "Bin"), "Bin: a plain error");
});
