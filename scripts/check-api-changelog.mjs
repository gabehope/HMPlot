// A public API change needs a CHANGELOG entry (R2.2). The public surface is the API report
// (api/hmplot.api.md, scripts/api-report.mjs) and the Python registry and signatures. When any of
// them differs from the base, CHANGELOG.md must differ too.
//   node scripts/check-api-changelog.mjs [base]
// The base is the argument, else origin/$GITHUB_BASE_REF (a pull request in CI), else main. The
// comparison is from the merge base with it to the working tree.
import { execFileSync } from "node:child_process";

const SURFACE = ["api/hmplot.api.md", "python/hmplot/registry.json", "python/hmplot/signatures.json"];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const base = process.argv[2] ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "main");
const since = git("merge-base", base, "HEAD");
const changed = new Set(git("diff", "--name-only", since).split("\n").filter(Boolean));
const surface = SURFACE.filter((file) => changed.has(file));
if (surface.length && !changed.has("CHANGELOG.md")) {
  console.error(`The public API changed since ${base} (${surface.join(", ")}) and CHANGELOG.md did not: add an entry.`);
  process.exit(1);
}
console.log(surface.length ? `The public API changed (${surface.join(", ")}), and CHANGELOG.md has an entry.` : `No public API change since ${base}.`);
