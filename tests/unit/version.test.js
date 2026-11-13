import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

test("package version is valid semver", () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
});

// The JavaScript and Python packages release in lockstep, with one version.
test("JavaScript and Python package versions match", () => {
  const pyproject = readFileSync(new URL("../../python/pyproject.toml", import.meta.url), "utf8");
  const init = readFileSync(new URL("../../python/hmplot/__init__.py", import.meta.url), "utf8");
  assert.equal(/^version = "([^"]+)"/m.exec(pyproject)?.[1], pkg.version);
  assert.equal(/^__version__ = "([^"]+)"/m.exec(init)?.[1], pkg.version);
  // So does the Claude Code plugin with the agent skill (R2.7).
  const plugin = JSON.parse(readFileSync(new URL("../../.claude-plugin/plugin.json", import.meta.url), "utf8"));
  assert.equal(plugin.version, pkg.version);
});
