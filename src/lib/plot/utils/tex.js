import { mathjax } from "@mathjax/src/cjs/mathjax.js";
import { TeX } from "@mathjax/src/cjs/input/tex.js";
import { SVG } from "@mathjax/src/cjs/output/svg.js";
import { browserAdaptor } from "@mathjax/src/cjs/adaptors/browserAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/cjs/handlers/html.js";
import "@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js";
let document;
/** TeX as MathJax SVG markup; `display` for display math ($$...$$ in Markdown, TODO 46). */
export async function texSVG(content, { display = false } = {}) {
  if (!document) {
    RegisterHTMLHandler(browserAdaptor());
    document = mathjax.document("", {
      InputJax: new TeX({ packages: ["base", "ams", "newcommand"] }),
      // One SVG per expression: MathJax 4 otherwise splits in-line math at its breakpoints into
      // several <svg> pieces (for the browser to wrap), and only the first was kept ("a+b" drew "a").
      OutputJax: new SVG({ fontCache: "none", linebreaks: { inline: false } }),
    });
  }
  const node = await document.convertPromise(content, { display });
  if (node.querySelector('[data-mml-node="merror"]'))
    throw new Error(`Invalid TeX: ${content}`);
  return node.querySelector("svg").outerHTML;
}
