// Vite's `?raw` imports for node scripts (scripts/build-llm-docs.mjs): the file's text as its
// default export. Registered with module.register().
import { readFile } from "node:fs/promises";

export async function load(url, context, next) {
  if (url.endsWith("?raw")) {
    const text = await readFile(new URL(url.slice(0, -4)), "utf8");
    return { format: "module", source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  }
  return next(url, context);
}
