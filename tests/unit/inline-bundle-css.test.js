import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { inlineBundleCSS } from "../../scripts/inline-bundle-css.mjs";

test("JavaScript-only bundles carry imported CSS and install it once per document", async () => {
  const root = await mkdtemp(join(tmpdir(), "hmplot-css-"));
  try {
    await writeFile(join(root, "entry.js"), 'import "./controls.css";');
    await writeFile(
      join(root, "controls.css"),
      '.control { display: inline-flex; --text: "</script>"; }',
    );
    const result = await build({
      configFile: false,
      root,
      logLevel: "silent",
      plugins: [inlineBundleCSS()],
      build: {
        write: false,
        lib: {
          entry: join(root, "entry.js"),
          formats: ["es"],
          fileName: "entry",
          cssFileName: "styles",
        },
      },
    });
    const { output } = Array.isArray(result) ? result[0] : result;
    assert.equal(
      output.filter((file) => file.fileName.endsWith(".css")).length,
      0,
    );
    const code = output.find((file) => file.type === "chunk").code;
    assert.ok(!code.includes("</script>"));
    const styles = [];
    const document = {
      getElementById: (id) => styles.find((style) => style.id === id),
      createElement: () => ({}),
      head: { appendChild: (style) => styles.push(style) },
    };
    const load = new Function("document", code);
    load(document);
    load(document);
    assert.equal(styles.length, 1);
    assert.match(styles[0].textContent, /display:inline-flex/);
    assert.match(styles[0].textContent, /<\/script>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
