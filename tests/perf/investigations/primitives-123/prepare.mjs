// Archive the requested baseline and overlay only owned fixtures. Never edit another checkout.
import { execFileSync } from "node:child_process";
import {
  mkdir,
  cp,
  symlink,
  writeFile,
  readdir,
  readFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const out = resolve(
  process.env.PRIMITIVE_SNAPSHOT ?? "/tmp/hmplot-123-frozen",
);
await mkdir(out); // Refuse to overwrite a previous frozen build.
const archive = execFileSync("git", ["archive", "0041638d"], {
  cwd: repo,
  maxBuffer: 150 * 1024 * 1024,
});
execFileSync("tar", ["-x", "-C", out], { input: archive });
await cp(
  new URL("./", import.meta.url),
  join(out, "tests/perf/investigations/primitives-123"),
  { recursive: true },
);
await symlink(join(repo, "node_modules"), join(out, "node_modules"));
await writeFile(
  join(out, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
    },
  }),
);
const files = {};
async function fingerprint(dir) {
  for (const item of await readdir(join(out, dir), { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await fingerprint(path);
    else
      files[path] = createHash("sha256")
        .update(await readFile(join(out, path)))
        .digest("hex");
  }
}
for (const dir of [
  "src",
  "vendor/jax-js/dist",
  "tests/perf/investigations/primitives-123",
])
  await fingerprint(dir);
await writeFile(
  join(out, "PRIMITIVE-SNAPSHOT.json"),
  JSON.stringify({ baseline: "0041638d", files }, null, 2),
);
console.log(
  `cd ${out}\nnode node_modules/vite/bin/vite.js build --config tests/perf/investigations/primitives-123/vite.config.mjs\nnode node_modules/vite/bin/vite.js preview --config tests/perf/investigations/primitives-123/vite.config.mjs --host 127.0.0.1 --port 5193 --strictPort`,
);
