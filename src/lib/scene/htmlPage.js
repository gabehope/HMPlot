// An exported HTML page (TODO 54): the scene's state and the standalone runtime, and a snapshot
// of the scene shown first. The live view mounts hidden (it still lays out, so the GPU draws);
// once every plot has drawn the snapshot fades out over it. Without WebGPU, or if the view fails
// to start, the snapshot stays, and its label says so. python/hmplot/exporter.py builds the same
// page for hm.export_html().

const escapeText = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * The page's module script holds the runtime, then this line, then the page's own code. The
 * runtime in the page reads its own source from there to export the page again
 * (standalone.js); python/hmplot/exporter.py writes the same.
 */
export const RUNTIME_SCRIPT = "hmplot-runtime";
export const PAGE_CODE = "\n// The page's own code, after the HMPlot runtime:\n";
/**
 * The runtime's place in a page exported for Python, which puts its copy there: the page leaves
 * the browser without the runtime's 14 MB (a notebook front end refuses to send a message over
 * 10 MB to the kernel).
 */
/**
 * Components whose loaded result an HTML export embeds unless `snapshot` is false. The scene
 * runtime reads their `snapshot` prop from the node (exportHTML); the component never does.
 */
export const SNAPSHOT_KINDS = Object.freeze(["Provider", "VectorTile"]);
export const RUNTIME_PLACEHOLDER = "/* HMPlot runtime */";

/** The runtime's source in an exported page's runtime script (its text before the page's code). */
export function pageRuntime(text) {
  const end = text.lastIndexOf(PAGE_CODE);
  return end < 0 ? text : text.slice(0, end);
}

// A snapshot shown in place of a live plot carries a small label in its top right corner (user
// request 2026-10-02): an exported page's and a docs example's preview. Page chrome only: never in
// the snapshot's SVG, an export or a thumbnail. Its texts, and what a screen reader hears (a status
// beside it, since the label goes with the snapshot): without WebGPU the label is short and the
// status says it in full.
export const PREVIEW_LABEL = "Static preview";
export const PREVIEW_NO_WEBGPU_LABEL = "Static · no WebGPU";
export const PREVIEW_NO_WEBGPU = "Static preview: this browser has no WebGPU";
export const PREVIEW_LOADING = "Static preview; loading the interactive plot";
export const PREVIEW_LIVE = "Interactive plot";
/** How long the snapshot takes to fade out over the live view, in milliseconds. */
export const PREVIEW_FADE = 250;

/**
 * The color of an image's top right corner, where the label sits ([r, g, b]), or null when it
 * cannot be read. The image must have loaded.
 */
export function cornerColor(image) {
  try {
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const [r, g, b, a] = context.getImageData(width - 2, 1, 1, 1).data;
    // A transparent corner shows the page behind it (white).
    const over = (value) => Math.round(value * a / 255 + 255 * (1 - a / 255));
    return [over(r), over(g), over(b)];
  } catch {
    return null;
  }
}

/**
 * The label's colors on a snapshot whose corner is `rgb` (white when null): the plot's own
 * background (opaque: what it covers would show through), with muted text and a hairline in its
 * foreground (light on a dark plot), so the label takes the plot's theme.
 */
export function previewLabelColors(rgb) {
  const [r, g, b] = rgb ?? [255, 255, 255];
  const ink = 0.2126 * r + 0.7152 * g + 0.0722 * b < 115 ? "255, 255, 255" : "15, 23, 42";
  return { background: `rgb(${r}, ${g}, ${b})`, color: `rgba(${ink}, 0.6)`, line: `rgba(${ink}, 0.12)` };
}

/**
 * A snapshot for the page: SVG markup placed inline (its prolog dropped, scaled to the page's
 * width by its viewBox), or a PNG as an <img> (a data: URL). null for none.
 */
export function snapshotMarkup(snapshot, title = "") {
  if (!snapshot) return "";
  if (snapshot.kind === "png")
    return `<img src="${escapeText(snapshot.href)}" alt="${escapeText(title)}">`;
  return String(snapshot.svg).replace(/^\s*<\?xml[^>]*>\s*/, "").replace(/<!DOCTYPE[^>]*>\s*/i, "");
}

/**
 * An exported page's own layout (TODO 132.6): the page's margin and the most its content grows
 * to, so a wide screen does not stretch the plots edge to edge (they fill the content's width).
 * The export's `page` option: true (this default), false (a bare page: no margin, no maximum) or
 * { maxWidth, margin } in CSS pixels, maxWidth null for none. python/hmplot/core.py _page_layout
 * reads the same.
 */
export const PAGE_LAYOUT = Object.freeze({ maxWidth: 960, margin: 24 });

/** The widest fixed `width` of a Plot in a scene tree (state nodes), or 0. */
export function widestPlot(node) {
  if (!node) return 0;
  const own = node.kind === "Plot" && Number.isFinite(node.props?.width) ? node.props.width : 0;
  return Math.max(own, ...(node.children ?? []).map(widestPlot));
}

/**
 * The `page` option as { maxWidth, margin }; an error says what to pass instead. With the
 * exported tree's `root`, the maximum width is at least its widest fixed-width Plot, which the
 * page would otherwise clip.
 */
export function pageLayout(page = true, root = null) {
  const layout = parsePageLayout(page), widest = widestPlot(root);
  return layout.maxWidth != null && widest > layout.maxWidth ? { ...layout, maxWidth: widest } : layout;
}

function parsePageLayout(page) {
  if (page === true || page == null) return { ...PAGE_LAYOUT };
  if (page === false) return { maxWidth: null, margin: 0 };
  const fail = () => { throw Error(`HTML export page must be true, false or { maxWidth, margin } in pixels (maxWidth null for none); received ${JSON.stringify(page)}.`); };
  if (typeof page !== "object" || Array.isArray(page) || Object.keys(page).some((key) => !Object.hasOwn(PAGE_LAYOUT, key))) fail();
  const { maxWidth = PAGE_LAYOUT.maxWidth, margin = PAGE_LAYOUT.margin } = page;
  if (!(maxWidth === null || (Number.isFinite(maxWidth) && maxWidth > 0)) || !(Number.isFinite(margin) && margin >= 0)) fail();
  return { maxWidth, margin };
}

/**
 * The page's base style for a layout: a system sans-serif and dark gray text (a theme's
 * "inherit" font is not the browser's serif, TODO 132.5), the margin (halved on a narrow screen)
 * and the content centered at most maxWidth wide. --hmplot-margin places the overlaid live view.
 */
export function pageStyle({ maxWidth, margin }) {
  const width = maxWidth == null ? "" : `max-width:calc(${maxWidth}px + 2 * var(--hmplot-margin));margin:0 auto;`;
  const narrow = margin > 0 ? `@media (max-width:600px){body{--hmplot-margin:${margin / 2}px}}` : "";
  return `html,body{margin:0;min-height:100%;background:#fff}body{--hmplot-margin:${margin}px;position:relative;${width}padding:var(--hmplot-margin);box-sizing:border-box;font-family:system-ui,sans-serif;color:#30343b}${narrow}`;
}

/**
 * The page: `title` (text), `json` (the payload, already escaped for a <script> element),
 * `bundle` (the standalone runtime's source) and `snapshot` ({ kind: "svg", svg } or
 * { kind: "png", href }, with `corner`, its top right color as [r, g, b], for the label; or null)
 * and `page` (pageLayout's option).
 */
export function htmlPage({ title = "HMPlot", json, bundle, snapshot = null, page = true }) {
  const safeBundle = String(bundle).replaceAll("</script", "<\\/script");
  const shown = snapshotMarkup(snapshot, title);
  // The label (in the snapshot, so it fades with it) and the status a screen reader hears.
  // Without WebGPU the label (and the status) says so at once, not only once the runtime's module
  // has run.
  const kept = `label.className="hmplot-kept";label.lastChild.data=${JSON.stringify(PREVIEW_NO_WEBGPU_LABEL)};status.textContent=${JSON.stringify(PREVIEW_NO_WEBGPU)};`;
  const snapshotBlock = shown
    ? `<div id="hmplot-snapshot" role="img" aria-label="${escapeText(title)}">${shown}<span id="hmplot-label" aria-hidden="true"><i></i>${PREVIEW_LABEL}</span></div><p id="hmplot-status" role="status">${PREVIEW_LOADING}</p><script>if(!navigator.gpu){const label=document.getElementById("hmplot-label"),status=document.getElementById("hmplot-status");${kept}}<\/script>`
    : "";
  const label = previewLabelColors(snapshot?.corner);
  // With a snapshot the live view loads hidden, then shows under it while it fades out (at once
  // with reduced motion); without one it shows as it loads, and a failure is the red message.
  const start = shown
    ? `const snapshot=document.getElementById("hmplot-snapshot"),root=document.getElementById("hmplot-root"),label=document.getElementById("hmplot-label"),status=document.getElementById("hmplot-status");
const keep=(error)=>{if(error)console.error(error);root.remove();label.className="hmplot-kept";status.textContent=${JSON.stringify(PREVIEW_LABEL)};if(!navigator.gpu||error?.code==="webgpu.unavailable"){${kept}}};
const drawn=()=>new Promise((resolve)=>{const check=()=>{const canvases=[...root.querySelectorAll(".canvas")];if(canvases.every((canvas)=>canvas.getAttribute("aria-busy")==="false"))resolve();else requestAnimationFrame(check);};check();});
const report=()=>{const errors=(globalThis.hmplotDiagnostics?.()??[]).filter((entry)=>entry.severity==="error");status.textContent=errors.length?${JSON.stringify(PREVIEW_LIVE)}+" · "+errors.length+(errors.length===1?" error: ":" errors: ")+errors[0].message:${JSON.stringify(PREVIEW_LIVE)};};
const live=()=>{status.textContent=${JSON.stringify(PREVIEW_LIVE)};setInterval(report,1000);root.classList.remove("hmplot-loading");if(matchMedia("(prefers-reduced-motion: reduce)").matches)return snapshot.remove();snapshot.classList.add("hmplot-leaving");snapshot.addEventListener("transitionend",(event)=>{if(event.target===snapshot)snapshot.remove();});setTimeout(()=>snapshot.remove(),${PREVIEW_FADE * 4});};
if(!navigator.gpu)keep();
else hmplotStandalone(payload).then(drawn).then(live,keep);`
    : `hmplotStandalone(payload).catch(error=>{document.getElementById("hmplot-error").textContent=(!navigator.gpu||error?.code==="webgpu.unavailable"?'Unable to render this HMPlot document. A WebGPU-capable browser is required.':'This HMPlot document failed to render:')+'\\n'+(error?.message??error);});`;
  const labelStyle = shown
    ? `#hmplot-snapshot{position:relative}#hmplot-snapshot.hmplot-leaving{position:absolute;left:var(--hmplot-margin);right:var(--hmplot-margin);top:var(--hmplot-margin);z-index:1;opacity:0;transition:opacity ${PREVIEW_FADE}ms cubic-bezier(.25,.46,.45,.94);pointer-events:none}#hmplot-snapshot.hmplot-leaving~#hmplot-root{isolation:isolate}#hmplot-label{position:absolute;top:4px;right:4px;display:flex;align-items:center;gap:5px;padding:1px 7px 1px 6px;border-radius:9px;font:500 11px/16px system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;pointer-events:none;user-select:none;color:${label.color};background:${label.background};box-shadow:0 0 0 1px ${label.line}}#hmplot-label i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:hmplot-pulse 1.6s ease-in-out infinite}#hmplot-label.hmplot-kept i{display:none}@keyframes hmplot-pulse{50%{opacity:.3}}@media (prefers-reduced-motion:reduce){#hmplot-label i{animation:none}}#hmplot-status{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(title)}</title><style>${pageStyle(pageLayout(page))}#hmplot-root{width:100%}#hmplot-root.hmplot-loading{position:absolute;left:var(--hmplot-margin);right:var(--hmplot-margin);top:var(--hmplot-margin);width:auto;visibility:hidden;pointer-events:none}#hmplot-snapshot>svg,#hmplot-snapshot>img{display:block;width:100%;height:auto;max-width:100%}${labelStyle}#hmplot-error{font:14px system-ui;color:#9b1c1c;white-space:pre-wrap}</style></head><body>${snapshotBlock}<div id="hmplot-root"${shown ? ' class="hmplot-loading"' : ""}></div><div id="hmplot-error" role="alert"></div><script id="hmplot-state" type="application/json">${json}<\/script><script type="module" id="${RUNTIME_SCRIPT}">${safeBundle}${PAGE_CODE}const payload=JSON.parse(document.getElementById("hmplot-state").textContent);
${start}<\/script></body></html>`;
}
