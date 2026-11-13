// npm run build:examples: scripts/build_examples.py with a Python that has the package's
// dependencies: $PYTHON, else the repository's .venv (a worktree's primary checkout's), else
// python3. One build runs at a time per checkout; another waits for it.
import { prepareDocs } from "./docs-pages.mjs";
import { acquire } from "./build-lock.mjs";
await prepareDocs();

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = process.platform === "win32" ? "Scripts/python.exe" : "bin/python";
const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" });
const venvs = [root, common.status === 0 ? path.dirname(common.stdout.trim()) : null]
  .filter(Boolean).map((folder) => path.join(folder, ".venv", bin));
const python = process.env.PYTHON ?? venvs.find(existsSync) ?? "python3";

// The examples export their previews through the Python package's standalone.js, which git does
// not keep (R1.4): a checkout without it builds the bundles first.
if (!existsSync(path.join(root, "python", "hmplot", "static", "standalone.js"))) {
  console.log("Examples: building the Python package's bundles first (npm run build:python)");
  const built = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:python"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

// A lock left by a build that died is taken over (scripts/build-lock.mjs).
const release = await acquire(path.join(root, "static", "example-builds", ".lock"));
let status = 1;
try {
  const result = spawnSync(python, [path.join(root, "scripts/build_examples.py"), ...process.argv.slice(2)], { stdio: "inherit" });
  status = result.status ?? 1;
} finally {
  release();
}
process.exit(status);
