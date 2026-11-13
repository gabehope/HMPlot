import test from "node:test";
import assert from "node:assert/strict";
import { input, literal, col } from "../../src/lib/plot/utils/names.js";
import { inputWriter, writerValue, RESET } from "../../src/lib/plot/utils/inputWriters.js";

// TODO 145.7: an input read makes its writes, carrying the read's default.
test("input(name, { default }) reads the input and makes its writes", () => {
  const root = input("root", { default: "all" });
  assert.equal(root.op, "input");
  assert.deepEqual(root.args, ["root"]);
  // The writes are not enumerable: the read is the same expression as input("root").
  assert.deepEqual(Object.keys(root), Object.keys(input("root")));
  assert.deepEqual(root.set("id"), { input: "root", column: "id", default: "all" });
  assert.deepEqual(root.set(col("id")), { input: "root", column: "id", default: "all" });
  assert.deepEqual(root.set(literal("all")), { input: "root", value: "all", default: "all" });
  assert.deepEqual(root.set(3), { input: "root", value: 3, default: "all" });
  assert.deepEqual(root.reset(), { input: "root", reset: true, default: "all" });
  // Without a default the writes give none of their own (a widget's applies).
  assert.deepEqual(input.focus.set("series"), { input: "focus", column: "series" });
  assert.throws(() => root.set({}), /takes a column .* or a constant/);
  assert.throws(() => input("root", { initial: 1 }), /options is \{ default \}/);
});

test("writers parse each form, and refuse what their place cannot do", async () => {
  const root = input("root");
  const click = inputWriter(root.set("id"), "Rect", "select");
  assert.equal(writerValue(click, (column) => `row's ${column}`), "row's id");
  assert.equal(writerValue(inputWriter(root.set(literal("b")), "Rect", "select"), () => "unread"), "b");
  assert.equal(writerValue(inputWriter(root.reset(), "Button", "set"), () => "unread"), RESET);
  // An int64 column's BigInt is a number (or text past 2^53), which JSON and inputs can carry.
  assert.equal(writerValue(click, () => 7n), 7);
  assert.equal(writerValue(click, () => 2n ** 60n), String(2n ** 60n));
  // A mark reads its row asynchronously: the promise's BigInt is normalized too.
  assert.equal(await writerValue(click, async () => 9n), 9);
  // The object form is the same write.
  assert.deepEqual(inputWriter({ input: "root", value: 2 }, "Rect", "select"), inputWriter(root.set(2), "Rect", "select"));
  assert.throws(() => inputWriter(root.set("id"), "Button", "set"), /reads a row, which a Button has none of/);
  assert.throws(() => inputWriter(root.reset(), "Points", "hover"), /hover cannot reset the input "root"/);
  assert.throws(() => inputWriter({ input: "root", column: "id", value: 1 }, "Rect", "select"), /one of a column, a value or reset; it gives column and value/);
  assert.throws(() => inputWriter({ input: "root" }, "Rect", "select"), /needs the column/);
  assert.equal(inputWriter(true, "Rect", "select"), null);
});
