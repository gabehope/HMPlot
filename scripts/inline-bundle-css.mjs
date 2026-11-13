import { createHash } from "node:crypto";

/** Standalone pages and notebook widgets load JavaScript alone. Svelte's emitCss:false
 * embeds component styles; Vite still extracts plain CSS imports. Carry those styles in
 * the entry too, installing each stylesheet once when a bundle is loaded in a document.
 */
export function inlineBundleCSS() {
  return {
    name: "inline-bundle-css",
    enforce: "post",
    generateBundle(_options, bundle) {
      const css = Object.values(bundle).filter(
        (file) => file.type === "asset" && file.fileName.endsWith(".css"),
      );
      if (!css.length) return;
      const source = css
        .map((file) =>
          typeof file.source === "string"
            ? file.source
            : new TextDecoder().decode(file.source),
        )
        .join("\n");
      const id = `hmplot-css-${createHash("sha256").update(source).digest("hex").slice(0, 16)}`;
      const text = JSON.stringify(source).replaceAll("<", "\\u003c");
      const install = `if(typeof document!=="undefined"&&!document.getElementById(${JSON.stringify(id)})){const style=document.createElement("style");style.id=${JSON.stringify(id)};style.textContent=${text};document.head.appendChild(style);}\n`;
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk" && file.isEntry)
          file.code = install + file.code;
      }
      for (const file of css) delete bundle[file.fileName];
    },
  };
}
