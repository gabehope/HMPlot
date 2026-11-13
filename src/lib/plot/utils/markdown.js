// Markdown text in layouts (TODO 46): CommonMark with GitHub's extensions (tables,
// strikethrough, autolinks, task lists, footnotes) and $math$ / $$math$$, parsed by micromark into
// an mdast tree and rendered here as escaped HTML. Raw HTML is not rendered; links and images
// keep only safe URLs. Math renders as placeholders the Markdown component fills with MathJax SVG.
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { math } from "micromark-extension-math";
import { mathFromMarkdown } from "mdast-util-math";

/** A markdown string as an mdast tree. */
export function parseMarkdown(text) {
  return fromMarkdown(String(text ?? ""), {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  });
}

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

/**
 * A URL a link or an image may use: http(s), mailto and tel links, fragments and relative paths
 * (and data: images). Anything else (javascript:, vbscript:, ...) is "".
 */
export function safeUrl(url, image = false) {
  const value = String(url ?? "").trim();
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value.replace(/[\u0000-\u001f\s]/g, ""))?.[1]?.toLowerCase();
  if (!scheme) return value;
  if (["http", "https"].includes(scheme)) return value;
  if (!image && ["mailto", "tel"].includes(scheme)) return value;
  if (image && scheme === "data" && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(value)) return value;
  return "";
}

/** An mdast tree (or markdown text) as HTML. */
export function renderMarkdown(input) {
  const tree = typeof input === "string" ? parseMarkdown(input) : input;
  const definitions = new Map(), footnotes = [];
  const collect = (node) => {
    if (node.type === "definition") definitions.set(node.identifier, node);
    if (node.type === "footnoteDefinition") footnotes.push(node);
    node.children?.forEach(collect);
  };
  collect(tree);
  const order = new Map();
  const children = (node, tight = false) => (node.children ?? []).map((child) => render(child, tight)).join("");
  const link = (url, title, body) => {
    const href = safeUrl(url);
    return href ? `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ""} rel="noopener noreferrer" target="_blank">${body}</a>` : body;
  };
  const image = (url, alt, title) => {
    const src = safeUrl(url, true);
    return src ? `<img src="${escape(src)}" alt="${escape(alt)}"${title ? ` title="${escape(title)}"` : ""}>` : escape(alt);
  };
  const cellAlign = (align) => (align ? ` style="text-align:${align}"` : "");
  function render(node, tight = false) {
    switch (node.type) {
      case "root": return children(node);
      case "paragraph": return tight ? children(node) : `<p>${children(node)}</p>`;
      case "heading": return `<h${node.depth}>${children(node)}</h${node.depth}>`;
      case "text": return escape(node.value);
      case "emphasis": return `<em>${children(node)}</em>`;
      case "strong": return `<strong>${children(node)}</strong>`;
      case "delete": return `<del>${children(node)}</del>`;
      case "inlineCode": return `<code>${escape(node.value)}</code>`;
      case "code": return `<pre><code${node.lang ? ` class="language-${escape(node.lang)}"` : ""}>${escape(node.value)}</code></pre>`;
      case "blockquote": return `<blockquote>${children(node)}</blockquote>`;
      case "list": {
        const tag = node.ordered ? "ol" : "ul", start = node.ordered && node.start != null && node.start !== 1 ? ` start="${Number(node.start)}"` : "";
        return `<${tag}${start}>${(node.children ?? []).map((item) => render(item, !node.spread)).join("")}</${tag}>`;
      }
      case "listItem": {
        const box = typeof node.checked === "boolean" ? `<input type="checkbox" disabled${node.checked ? " checked" : ""}> ` : "";
        return `<li${box ? ' class="task"' : ""}>${box}${(node.children ?? []).map((child) => render(child, tight && !node.spread)).join("")}</li>`;
      }
      case "thematicBreak": return "<hr>";
      case "break": return "<br>";
      case "link": return link(node.url, node.title, children(node));
      case "image": return image(node.url, node.alt, node.title);
      case "linkReference": {
        const definition = definitions.get(node.identifier);
        return definition ? link(definition.url, definition.title, children(node)) : escape(`[${node.label ?? ""}]`);
      }
      case "imageReference": {
        const definition = definitions.get(node.identifier);
        return definition ? image(definition.url, node.alt, definition.title) : escape(node.alt);
      }
      case "definition": return "";
      case "html": return ""; // raw HTML is not rendered
      case "table": {
        const [head, ...rows] = node.children ?? [];
        const cells = (row, tag) => (row?.children ?? []).map((cell, i) => `<${tag}${cellAlign(node.align?.[i])}>${children(cell)}</${tag}>`).join("");
        return `<table>${head ? `<thead><tr>${cells(head, "th")}</tr></thead>` : ""}${rows.length ? `<tbody>${rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody>` : ""}</table>`;
      }
      case "footnoteReference": {
        if (!order.has(node.identifier)) order.set(node.identifier, order.size + 1);
        const n = order.get(node.identifier);
        return `<sup class="footnote-ref"><a href="#hm-fn-${escape(node.identifier)}">${n}</a></sup>`;
      }
      case "footnoteDefinition": return "";
      case "math": return `<div class="hm-math" data-display="true" data-tex="${escape(node.value)}">${escape(node.value)}</div>`;
      case "inlineMath": return `<span class="hm-math" data-tex="${escape(node.value)}">${escape(node.value)}</span>`;
      default: return node.children ? children(node) : escape(node.value ?? "");
    }
  }
  let html = render(tree);
  const cited = footnotes.filter((note) => order.has(note.identifier)).sort((a, b) => order.get(a.identifier) - order.get(b.identifier));
  if (cited.length)
    html += `<section class="footnotes"><ol>${cited.map((note) => `<li id="hm-fn-${escape(note.identifier)}">${children(note, true)}</li>`).join("")}</ol></section>`;
  return html;
}
