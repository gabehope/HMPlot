import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = new URL("../../", import.meta.url);
const write = (path, contents, mode) => writeFileSync(path, contents, { mode });
const tree = (path) => Object.fromEntries(readdirSync(path, { withFileTypes: true }).map((entry) =>
  [entry.name, entry.isDirectory() ? tree(join(path, entry.name)) : readFileSync(join(path, entry.name), "utf8")]));

test("fork verification compares all artifacts and LICENSE without mutating vendor or cached source", () => {
  const root = mkdtempSync(join(tmpdir(), "hmplot-fork-check-"));
  try {
    const vendor = join(root, "vendor/jax-js"), cache = join(root, "cache/jax-js"), bin = join(root, "bin"),
      output = join(root, "output"), script = join(root, "scripts/build-jax-fork.sh");
    for (const dir of [join(root, "scripts"), join(vendor, "dist"), join(vendor, "patches"), join(cache, ".git"), bin, output])
      mkdirSync(dir, { recursive: true });
    cpSync(new URL("scripts/build-jax-fork.sh", source), script);
    const pins = readFileSync(new URL("vendor/jax-js/build.env", source), "utf8");
    write(join(vendor, "build.env"), pins);
    const values = Object.fromEntries(pins.split("\n").filter((line) => line.startsWith("JAX_")).map((line) => line.split("=")));
    write(join(cache, "package.json"), JSON.stringify({ packageManager: `pnpm@${values.JAX_PNPM_VERSION}` }));
    write(join(cache, "LICENSE"), "upstream license");
    write(join(cache, "developer-work"), "keep this checkout");
    write(join(output, "index.js"), "export default 1");
    write(join(output, "index.js.map"), "source map");
    write(join(output, "shader.wgsl"), "asset");
    cpSync(output, join(vendor, "dist"), { recursive: true });
    cpSync(join(cache, "LICENSE"), join(vendor, "LICENSE"));
    // Tool doubles keep this policy test offline; the dedicated workflow builds real patches.
    write(join(bin, "node"), `#!/bin/sh\nif [ "$1" = --version ]; then echo v${values.JAX_NODE_VERSION}; else exec '${process.execPath}' "$@"; fi\n`, 0o755);
    write(join(bin, "git"), `#!${process.execPath}\nconst fs=require('node:fs');const a=process.argv.slice(2);if(a[0]==='clone')fs.cpSync(a.at(-2),a.at(-1),{recursive:true});if(a[0]==='rev-parse')console.log('${values.JAX_BASE_COMMIT}');if(a[0]==='am')fs.writeFileSync('PATCHED','applied');\n`, 0o755);
    write(join(bin, "pnpm"), `#!/bin/sh\ncase "$1" in --version) echo ${values.JAX_PNPM_VERSION};; exec) mkdir dist; cp -R "$JAX_TEST_OUTPUT/." dist/;; esac\n`, 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, JAX_FORK_WORKDIR: join(root, "cache"), JAX_TEST_OUTPUT: output };
    const run = (...args) => execFileSync("sh", [script, ...args], { env, encoding: "utf8", stdio: "pipe" });
    const before = tree(vendor), sourceBefore = tree(cache);
    assert.match(run("--check"), /and LICENSE match/);
    write(join(cache, "LICENSE"), "changed upstream license");
    assert.throws(() => run("--check"), /Vendored artifacts differ/);
    assert.deepEqual(tree(vendor), before, "failed license verification does not write LICENSE");
    write(join(cache, "LICENSE"), sourceBefore.LICENSE);
    write(join(output, "shader.wgsl"), "changed asset");
    assert.throws(() => run("--check"), /Vendored artifacts differ/);
    assert.deepEqual(tree(vendor), before, "failed asset verification does not write dist");
    assert.deepEqual(tree(cache), sourceBefore, "patches do not touch the reusable checkout");
    run();
    assert.equal(readFileSync(join(vendor, "dist/shader.wgsl"), "utf8"), "changed asset");
    assert.equal(readFileSync(join(vendor, "dist/index.js.map"), "utf8"), "source map");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
