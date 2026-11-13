import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFileSync } from "node:fs";
import { inlineBundleCSS } from "./scripts/inline-bundle-css.mjs";
import { bundledPackages } from "./scripts/third-party-notices.mjs";
// What the bundle contains, for THIRD_PARTY_NOTICES.md (R1.5).
const packages = bundledPackages("standalone");
export default defineConfig({
  plugins: [
    {
      name: "inline-standalone-workers",
      enforce: "pre",
      // Each module that starts a worker gets it inlined (the page is one file).
      transform(code, id) {
        const inlined = {
          "/plot/utils/geoWorker.js": ["GeometryWorker", "geoGeometry.worker.js"],
          "/plot/utils/dodge.js": ["DodgePlacementWorker", "dodgePlacement.worker.js"],
          "/plot/utils/vectorTileWorker.js": ["VectorTileWorker", "vectorTile.worker.js"],
        };
        const entry = Object.entries(inlined).find(([suffix]) => id.endsWith(suffix));
        if (!entry) return;
        const [name, file] = entry[1];
        return `import ${name} from '../workers/${file}?worker&inline';\n` + code.replace(/new Worker\(\s*new URL\([^;]*?\{ type: "module" \},?\s*\)/, `new ${name}()`);
      },
    },
    {
      // The bundle inlines the default font (Source Sans 3); the OFL travels with every copy.
      name: "font-license",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "SourceSans3-LICENSE.md", source: readFileSync("src/lib/fonts/source-sans-3/LICENSE.md", "utf8") });
      },
    },
    svelte({ compilerOptions: { dev: false }, emitCss: false }),
    packages.plugin,
    inlineBundleCSS(),
  ],
  resolve: { dedupe: ["svelte", "three", "@hmplot/jax", "@threlte/core", "@threlte/extras"] },
  build: {
    target: "esnext", outDir: "python/hmplot/static", emptyOutDir: false,
    assetsInlineLimit: 100000000,
    lib: { entry: "src/lib/scene/standalone.js", formats: ["es"], fileName: () => "standalone.js" },
    rollupOptions: { output: { inlineDynamicImports: true } }, minify: process.env.HMPLOT_UNMINIFIED ? false : true,
  },
  // Classic workers: an exported page opened from disk has an opaque origin, where Chrome
  // refuses a module worker from a blob URL (the GeoJSON worker failed and the page kept its
  // static preview, TODO 133.4). Inlined workers need no module loading.
  worker: { format: "iife", plugins: packages.worker },
});
