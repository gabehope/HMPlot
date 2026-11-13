// Every browser spec takes its `test` from tests/browser/fixtures.js, whose page loads that stall
// are loaded again and reported (TODO 136.1b): a spec that imports @playwright/test's goes without.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

test("browser specs import test from fixtures.js", () => {
  const folder = new URL("../browser/", import.meta.url);
  const specs = readdirSync(folder, { recursive: true }).filter((file) => file.endsWith(".spec.js"));
  assert.ok(specs.length > 100);
  // Playwright's own test, by any path (a dynamic import too), or none from fixtures.js.
  const direct = specs.filter((file) => {
    const source = readFileSync(new URL(file, folder), "utf8");
    return /["'](@playwright\/test|playwright\/test)["']/.test(source) ||
      !/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["']\.\/fixtures\.js["']/.test(source);
  });
  assert.deepEqual(direct, [], "import { test, expect } from \"./fixtures.js\" instead");
});
