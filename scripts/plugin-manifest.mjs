#!/usr/bin/env node
// A plugin package's manifest.json (TODO 138.4; src/lib/plot/plugins/manifest.js):
//   node scripts/plugin-manifest.mjs path/to/plugin.js [--version 1.0.0] [--out path/to/manifest.json]
// The file is an ES module whose default export is the plugin ({ name, apiVersion, setup }); it
// imports nothing (the page loads it on its own), so setup takes three, TSL and jax from hm.
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as three from "three/webgpu";
import * as tsl from "three/tsl";
import * as jax from "@hmplot/jax";
import { pluginManifest } from "../src/lib/plot/plugins/manifest.js";

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const [value] = args.splice(at, 2).slice(1);
  if (!value) throw Error(`${name} takes a value.`);
  return value;
};
const version = option("--version"), out = option("--out");
if (args.length !== 1) {
  console.error("Usage: node scripts/plugin-manifest.mjs path/to/plugin.js [--version 1.0.0] [--out manifest.json]");
  process.exit(2);
}
const file = resolve(args[0]);
const { default: plugin } = await import(pathToFileURL(file).href);
if (!plugin) throw Error(`${args[0]} has no default export: export default { name, apiVersion: 1, setup(hm) { ... } }.`);
const manifest = pluginManifest(plugin, readFileSync(file), { main: basename(file), version, libraries: { three, tsl, jax } });
const target = out ?? join(dirname(file), "manifest.json");
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${target}: ${manifest.name} ${manifest.version}, ${manifest.hash}`);
