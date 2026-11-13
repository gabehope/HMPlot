import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, renderMarkdown, safeUrl } from "../../src/lib/plot/utils/markdown.js";
import { breakLines, titleSize } from "../../src/lib/plot/utils/textLayout.js";
import { displayValue, placeholderText } from "../../src/lib/plot/utils/inputs.js";
import { inputNumberLabel } from "../../src/lib/plot/utils/numberLabels.js";
import { validateBands, referenceValue, polarBands } from "../../src/lib/plot/utils/axes.js";

// TODO 46: Markdown, placeholders, Title's lines, bands.

test("markdown renders each construct as escaped HTML and drops raw HTML", () => {
  assert.equal(renderMarkdown("# One\n\n## Two"), "<h1>One</h1><h2>Two</h2>");
  assert.equal(renderMarkdown("*a* **b** ~~c~~ `d<e`"), "<p><em>a</em> <strong>b</strong> <del>c</del> <code>d&lt;e</code></p>");
  assert.equal(renderMarkdown("a <b>raw</b> <script>x()</script> & b"), "<p>a raw x() &amp; b</p>");
  assert.equal(renderMarkdown("<div onclick=\"x()\">block</div>"), "");
  assert.equal(renderMarkdown("[ok](https://x.org \"T\") [no](javascript:alert(1)) <mailto:a@b.c>"),
    '<p><a href="https://x.org" title="T" rel="noopener noreferrer" target="_blank">ok</a> no <a href="mailto:a@b.c" rel="noopener noreferrer" target="_blank">mailto:a@b.c</a></p>');
  assert.equal(renderMarkdown("![alt](data:text/html;base64,PHM+)"), "<p>alt</p>");
  assert.equal(renderMarkdown("- a\n- [x] b\n\n1. one\n2. two"),
    '<ul><li>a</li><li class="task"><input type="checkbox" disabled checked> b</li></ul><ol><li>one</li><li>two</li></ol>');
  assert.equal(renderMarkdown("3. three"), '<ol start="3"><li>three</li></ol>');
  assert.equal(renderMarkdown("| a | b |\n|:-|-:|\n| 1 | 2 |"),
    '<table><thead><tr><th style="text-align:left">a</th><th style="text-align:right">b</th></tr></thead><tbody><tr><td style="text-align:left">1</td><td style="text-align:right">2</td></tr></tbody></table>');
  assert.equal(renderMarkdown("> q\n\n---\n\n```js\na<b\n```"), '<blockquote><p>q</p></blockquote><hr><pre><code class="language-js">a&lt;b</code></pre>');
  assert.equal(renderMarkdown("x $a<b$ y\n\n$$\n\\frac12\n$$"),
    '<p>x <span class="hm-math" data-tex="a&lt;b">a&lt;b</span> y</p><div class="hm-math" data-display="true" data-tex="\\frac12">\\frac12</div>');
  assert.equal(renderMarkdown("See [the docs][d].\n\n[d]: https://d.org"),
    '<p>See <a href="https://d.org" rel="noopener noreferrer" target="_blank">the docs</a>.</p>');
  assert.match(renderMarkdown("A[^n]\n\n[^n]: Note."), /<sup class="footnote-ref"><a href="#hm-fn-n">1<\/a><\/sup>.*<li id="hm-fn-n">Note\.<\/li>/);
  assert.equal(renderMarkdown(""), "");
  assert.equal(parseMarkdown("x").type, "root");
  assert.deepEqual(["https://a", "/rel", "#frag", "tel:1", "JaVaScRiPt:x", " java\tscript:x", "vbscript:x"].map((url) => safeUrl(url)),
    ["https://a", "/rel", "#frag", "tel:1", "", "", ""]);
});

test("placeholders show input values as their inputs show them; a missing input is an error", () => {
  const store = { display(name, where) {
    if (name === "year") return "2020";
    throw Error(`${where} reads $${name}, but no input named "${name}" is in its input context or around it.`);
  } };
  assert.equal(placeholderText("Anomaly, {$year} ({$year})", store, "Title.text"), "Anomaly, 2020 (2020)");
  assert.equal(placeholderText("No reads, {$ not} {year}", null, "Title.text"), "No reads, {$ not} {year}");
  assert.equal(placeholderText(undefined, store, "Title.text"), "");
  assert.throws(() => placeholderText("{$nope}", store, "Title.text"), /Title\.text reads \$nope, but no input named "nope"/);
  assert.throws(() => placeholderText("{$year}", null, "title"), /^Error: title shows \{\$year\}, but there is no input context around it/);
  assert.deepEqual([["a", "b"], 3.14159265, 1e-7, 12, NaN, null, true, -12345.6].map(displayValue), ["a, b", "3.142", "1e-7", "12", "NaN", "", "true", "−12,346"]);
  // A slider's value (TODO 132.3): its format, else its numeric step's decimals, else as tooltips.
  assert.deepEqual([[12.345, undefined, 0.001], [12.349, undefined, 0.001], [0.35, undefined, undefined], [12345.6, undefined, 1], [0.35, ".0%", 0.01]]
    .map(([v, own, step]) => inputNumberLabel(v, own, step)), ["12.345", "12.349", "0.35", "12,346", "35%"]);
});

test("Title breaks lines at newlines and the width, and splits a word too long for a line", () => {
  const measure = (text) => text.length * 10;
  assert.deepEqual(breakLines("one two three four", 100, measure), ["one two", "three four"]);
  assert.deepEqual(breakLines("one two three four", 95, measure), ["one two", "three", "four"]);
  assert.deepEqual(breakLines("a\nb  c\n\nd", 1000, measure), ["a", "b c", "", "d"]);
  assert.deepEqual(breakLines("abcdefghij xy", 40, measure), ["abcd", "efgh", "ij", "xy"]);
  assert.deepEqual(breakLines("one two three", 20, measure, false), ["one two three"]);
  assert.deepEqual(breakLines("one two", 0, measure), ["one two"]);
  assert.deepEqual(breakLines("", 100, measure), [""]);
  assert.deepEqual(["title", undefined, "subtitle", "caption", 20].map((size) => titleSize(size, 12)), [16, 16, 13, 11, 20]);
  assert.equal(titleSize("caption", 8), 8);
  assert.throws(() => titleSize("huge", 12), /Title size must be "title", "subtitle", "caption" or a number of pixels; received "huge"/);
});

test("bands are validated like rules and outline polar sectors", () => {
  assert.deepEqual(validateBands([{ axis: "x", from: 1, to: 0, label: "a", color: "#aabbcc", opacity: 0.2 },
    { axis: "y", from: "2026-01-01T00:00Z", to: new Date(0) }]).length, 2);
  for (const [bands, message] of [
    [{}, /Bands must be a list\.$/], [[null], /Each band is an object/],
    [[{ axis: "z", from: 0, to: 1 }], /A band's axis is "x" or "y"; received "z"/],
    [[{ axis: "x", from: 0, to: NaN }], /A band's from and to are each a number, a Date, or an ISO date such as "2024-03-01"/],
    [[{ axis: "x", from: "next tuesday", to: 1 }], /received \["next tuesday",1\]/],
    [[{ axis: "x", from: "2026-02-30", to: 1 }], /ISO date such as/],
    [[{ axis: "x", from: 0, to: 1, color: "red" }], /Use a six-digit hex band color\.$/],
    [[{ axis: "x", from: 0, to: 1, opacity: 2 }], /A band's opacity must be between 0 and 1/],
    [[{ axis: "x", from: 0, to: 1, label: 3 }], /A band's label must be a string/],
  ]) assert.throws(() => validateBands(bands), message);
  assert.equal(referenceValue("1970-01-01T00:00:01Z"), 1000);
  // A date or date and time without an offset is a wall time in the axis's zone (eval pilot
  // 2026-10-12: a "2024-03-01" band was refused and the whole plot failed).
  assert.equal(validateBands([{ axis: "x", from: "2024-03-01", to: "2024-05-31T12:30" }]).length, 1);
  assert.equal(referenceValue("2024-03-01"), Date.UTC(2024, 2, 1));
  assert.equal(referenceValue("2024-03-01T09:30"), Date.UTC(2024, 2, 1, 9, 30));
  assert.equal(referenceValue("2024-03-01", "America/New_York"), Date.UTC(2024, 2, 1, 5));
  assert.equal(referenceValue("2024-03-01T00:00:00+02:00", "America/New_York"), Date.UTC(2024, 1, 29, 22));
  const options = (values) => ({ get: (key) => values[key], child: () => ({ get: (key) => values[key] }) });
  const [wedge, ring] = polarBands(options({ angleUnit: "degrees", ybounds: [0, 10],
    referenceBands: [{ axis: "x", from: 90, to: 0 }, { axis: "y", from: 2, to: 30, label: "ring" }] }));
  assert.equal(wedge.outer.length, wedge.inner.length);
  assert.deepEqual([wedge.outer[0], wedge.outer.at(-1), wedge.inner[0]], [[0, 10], [90, 10], [0, 0]]);
  assert.ok(wedge.outer.length >= 46, "sampled about every 2 degrees");
  assert.deepEqual([ring.outer[0], ring.inner[0], ring.outer.at(-1)[0], ring.label], [[0, 10], [0, 2], 360, "ring"]);
  assert.deepEqual(polarBands(options({ ybounds: [0, 1], referenceBands: [{ axis: "x", from: 3, to: 3 }] })), []);
});
