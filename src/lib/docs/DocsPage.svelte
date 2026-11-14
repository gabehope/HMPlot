<script>
  // The docs' page (TODO 68.1): navigation, prose (`content`, the route's Markdown) and examples,
  // rendered on the server. `data` is the route's page data (routes/examples/docsPages.js
  // docsPage: mode, id, item, nav, ...; with `examples`, its examples' sources and builds from
  // exampleData.server.js, which reach each Example through context). The manifests stay on the
  // server: this component imports none.
  import { onMount, setContext, untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { base } from "$app/paths";
  import { installRootedFetch } from "./rootedFetch.js";
  import Example from "./Example.svelte";
  import ExampleCard from "./ExampleCard.svelte";
  import SourceCode from "./SourceCode.svelte";
  import OptionsList from "./OptionsList.svelte";
  import { previewLoaders, previewSources } from "../../routes/examples/previewRegistry.js";
  let { data, content, legacyPreview = false } = $props();
  // Under a base path, the examples' root-relative data URLs (rootedFetch.js).
  installRootedFetch();
  setContext("hmplot-docs-examples", () => data.examples ?? {});
  const mode = $derived(data.mode), id = $derived(data.id), item = $derived(data.item), language = $derived(data.language);
  // The route's language from the start, so the server renders the page as the browser will.
  let codeLanguage = $state(untrack(() => data.language) ?? "svelte"), query = $state("");
  onMount(() => { try { codeLanguage = language ?? localStorage.getItem("hmplot-docs-language") ?? "svelte"; } catch { codeLanguage = language ?? "svelte"; } });
  // A dev server makes a missing card thumbnail in the background (scripts/vite-examples.js, TODO
  // 73.8): the page's data loads again when one of its cards' has been made.
  onMount(() => {
    if (!import.meta.hot) return;
    const events = ["hmplot:thumbnails-built", "hmplot:examples-built"];
    let timer;
    const made = (event) => {
      const cards = [...(data.gallery ?? []), ...(data.curated ?? []), ...(data.additional ?? []).flatMap((group) => group.examples)];
      if (event.error || !cards.some((card) => !card.thumbnail && event.ids?.includes(card.id))) return;
      clearTimeout(timer);
      timer = setTimeout(invalidateAll, 300);
    };
    for (const name of events) import.meta.hot.on(name, made);
    return () => { clearTimeout(timer); for (const name of events) import.meta.hot?.off(name, made); };
  });
  $effect(() => { if (language) codeLanguage = language; });
  const filteredApi = $derived(mode === "api" ? data.nav.filter(e => e.search.includes(query.toLowerCase())) : []);
  const groups = $derived((data.groups ?? []).filter(group => filteredApi.some(e => e.group === group)));
  const pageTitle = e => (codeLanguage === "python" ? e?.pythonTitle : e?.title) ?? e?.title;
  const otherLanguage = $derived(mode === "api" && item?.languages && item.languages !== (codeLanguage === "python" ? "python" : "js"));
  const matches = (e) => `${e.title} ${e.description} ${e.tags}`.toLowerCase().includes(query.toLowerCase());
  const filteredExamples = $derived((data.curated ?? []).filter(matches));
  const filteredGroups = $derived((data.additional ?? []).map(group => ({ ...group, examples: group.examples.filter(matches) })).filter(group => group.examples.length));
  const exampleId = $derived(`${item?.aliasOf ?? item?.id}-basic`);
  // Browser-only, as previewLoaders (previewRegistry.js).
  const legacyLoader = $derived(previewLoaders[id] ?? (() => import.meta.env.SSR ? null : import("../../routes/examples/Example.svelte")));
  // The snippet shown: the page's language when the entry has it, else the one it has (a
  // JavaScript-only page opened from Python shows its Svelte, TODO 67.4). The choice stays the page's.
  const sourceLanguage = $derived(item?.[codeLanguage] ? codeLanguage : item?.svelte ? "svelte" : item?.python ? "python" : codeLanguage);
  const guideIndex = $derived(mode === "guide" ? data.nav.findIndex(e => e.id === id) : -1);
  // The page as Markdown (R2.5; routes/examples/docsMarkdown.server.js), for agents and text readers.
  const markdown = $derived(mode === "guide" ? `${base}/docs/${id}.md` : mode === "api" ? `${base}/reference/${language}/${item?.aliasOf ?? id}.md`
    : mode === "example" ? `${base}/examples/${id}.md` : null);
</script>

<svelte:head><title>{mode === "home" ? "HMPlot documentation" : mode === "examples" ? "Examples · HMPlot" : `${mode === "api" ? pageTitle(item) : item?.title} · HMPlot`}</title>{#if markdown}<link rel="alternate" type="text/markdown" href={markdown} />{/if}</svelte:head>
<div class="docs">
  <header><a class="brand" href="{base}/">HMPlot</a><nav aria-label="Documentation"><a class:active={mode === "guide"} href="{base}/docs/introduction">User guide</a><a class:active={mode === "api"} href={`${base}/reference/${codeLanguage}/plot`}>API reference</a><a class:active={mode === "examples" || mode === "example"} href="{base}/examples">Examples</a></nav></header>
  {#if mode === "home"}
    <main class="home">
      <h1>HMPlot</h1><p class="lead">Composable plots for Svelte and Python.</p>
      <p>Build charts from marks, named data, scales, and transforms. The same rendering library powers Svelte applications and Python notebooks, with GPU computation and interactive 2D and 3D views. It was built for real-time visualization of neural networks, as in these <a href="https://gabehope.github.io/teaching-demos/">teaching demos</a>.</p>
      <h2>A first plot</h2><p>A Plot, a mark and a legend are enough: here, the Palmer penguins' bills, colored by species. Python uses a context manager; Svelte uses child markup. Scene is only needed when composing a larger display.</p>
      <div class="first-plot"><Example id="penguins" bind:language={codeLanguage} priority /></div>
      {#if data.install}{@const install = data.install}
        <section class="install" aria-labelledby="install">
          <h2 id="install">Install</h2>
          <p>HMPlot {install.version} is an alpha release: the API may still change. It is not on PyPI or npm yet; install it from its <a href={install.release}>GitHub release</a>. Report problems on <a href={`${install.repository}/issues`}>GitHub</a>.</p>
          <h3>Python</h3><p>Python 3.11 or later, in the environment of your notebook's kernel:</p>
          <pre><code>pip install {install.wheel}</code></pre>
          <h3>Svelte</h3><p>Svelte 5; npm also installs the peer dependencies, three.js and Threlte:</p>
          <pre><code>npm install {install.tarball}</code></pre>
          <p>Interactive rendering requires WebGPU, in the browser or the notebook's webview.</p>
        </section>
      {/if}
      <h2>Gallery</h2><p>Statistics, linked views, graphs, maps and 3D scenes, each with its source.</p>
      <div class="cards">{#each data.gallery ?? [] as example (example.id)}<ExampleCard {example} heading="h3" />{/each}</div>
      <p><a href="{base}/examples">All examples →</a></p>
    </main>
  {:else if mode === "guide" && data.unpublished}
    <main class="home"><h1>User guide</h1>
      <p class="lead">The user guide is under construction.</p>
      <p>Until it is written, the <a href="{base}/reference/svelte/plot">API reference</a> describes every component with an example in Svelte and Python, and the <a href="{base}/examples">examples</a> show complete programs beside their live charts.</p>
    </main>
  {:else if mode === "examples"}
    <main class="gallery"><h1>Examples</h1><p>Choose a chart to open its live preview and source. Examples mount individually.</p><label class="search">Find an example<input type="search" bind:value={query} placeholder="Maps, statistics, interaction…" /></label>
      <!-- The first row's thumbnails load at once; the others as they come near the viewport. -->
      <div class="cards">{#each filteredExamples as example, i (example.id)}<ExampleCard {example} eager={i < 5} />{/each}</div>
      <h2>Additional examples</h2>
      {#each filteredGroups as group (group.name)}<h3>{group.name}</h3><div class="cards">{#each group.examples as example (example.id)}<ExampleCard {example} heading="h4" />{/each}</div>{/each}
    </main>
  {:else}
    <main class="layout"><aside aria-label="Section navigation">
      {#if mode === "guide"}
        {#each ["introduction", "tutorial", "guides"] as section}
          <h2>{section}</h2>{#each data.nav.filter(e => e.section === section) as entry}<a class:active={entry.id === id} href={`${base}/docs/${entry.id}`}>{entry.title}</a>{/each}
        {/each}
      {:else if mode === "example"}<h2>Examples</h2><a href="{base}/examples">All examples</a>{#each data.nav as entry}<a class:active={entry.id === id} href={`${base}/examples/${entry.id}`}>{entry.title}</a>{/each}
      {:else}<label class="search">Search reference<input bind:value={query} type="search" placeholder="Name or property" /></label>{#each groups as group}<h2>{group}</h2>{#each filteredApi.filter(e => e.group === group) as entry}<a class:active={entry.id === id || entry.id === item?.aliasOf} class:other-language={entry.languages && entry.languages !== (codeLanguage === "python" ? "python" : "js")} href={`${base}/reference/${codeLanguage}/${entry.id}`}>{pageTitle(entry)}</a>{/each}{/each}{/if}
    </aside>
    <article>
      <h1>{mode === "api" ? pageTitle(item) : item.title}</h1>{#if item.summary ?? item.description}<p class="summary">{item.summary ?? item.description}</p>{/if}
      {#if otherLanguage}<p class="language-note">{item.languages === "python" ? "Python only. Svelte pages lay this out with HTML and CSS." : "JavaScript only."}</p>{/if}
      {#if mode === "api"}
        {#if data.paired}{#key exampleId}<Example id={exampleId} bind:language={codeLanguage} priority />{/key}
        {:else if item.svelte || item.python}
          <section aria-label="Usage example"><div role="group" aria-label="Code language">
            {#if item.svelte}<button onclick={() => codeLanguage = "svelte"} aria-pressed={sourceLanguage === "svelte"}>Svelte</button>{/if}
            {#if item.python}<button onclick={() => codeLanguage = "python"} aria-pressed={sourceLanguage === "python"}>Python</button>{/if}
          </div><SourceCode source={item[sourceLanguage] ?? ""} language={sourceLanguage} /></section>
        {/if}
        <OptionsList options={data.options[codeLanguage === "python" ? "python" : "js"]} language={codeLanguage} />
        {#if content}<div class="markdown">{@render content()}</div>{/if}
        {#if data.related?.length}<section><h2>Related examples</h2>{#each data.related as example}<p><a href={`${base}/examples/${example.id}`}>{example.title}</a></p>{/each}</section>{/if}
      {:else if mode === "guide"}
        {#if content}<div class="markdown">{@render content()}</div>{/if}
        <nav class="next" aria-label="Guide pagination">{#if data.nav[guideIndex - 1]}<a href={`${base}/docs/${data.nav[guideIndex - 1].id}`}>← Previous</a>{/if}{#if data.nav[guideIndex + 1]}<a href={`${base}/docs/${data.nav[guideIndex + 1].id}`}>Next →</a>{/if}</nav>
      {:else if mode === "example"}
        {#key id}
          {#if data.paired && !legacyPreview}<Example {id} example={item} bind:language={codeLanguage} priority />
          {:else}<Example {id} loader={legacyLoader} sourceLoader={previewSources[id]} example={item} bind:language={codeLanguage} priority />{/if}
        {/key}
      {/if}
    </article></main>
  {/if}
</div>
<style>
  :global(body){margin:0;background:#fff;color:#26313b;font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
  .docs{max-width:1260px;margin:auto;padding:0 28px}header{min-height:66px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dce1e5;gap:24px}.brand{font-weight:650;color:#26313b;text-decoration:none}header nav{display:flex;gap:24px}a{color:#215b85}header nav a{color:#52616d;text-decoration:none;padding:21px 0}header nav a.active{color:#215b85;box-shadow:0 2px #215b85}
  h1{font-size:32px;line-height:1.2;font-weight:600;letter-spacing:-.6px;margin:0 0 18px}h2{font-size:20px;line-height:1.4;font-weight:600;margin:30px 0 12px}p{margin:0 0 18px}.summary{color:#52616d;font-size:17px}.layout{display:grid;grid-template-columns:225px minmax(0,820px);gap:45px;padding:34px 0 70px}aside{position:sticky;top:20px;align-self:start;max-height:calc(100vh - 40px);overflow:auto;border-right:1px solid #e2e6e9;padding-right:18px}aside h2{font-size:12px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#5c6872}aside h2:first-child{margin-top:0}aside a{display:block;text-decoration:none;color:#52616d;padding:5px 8px;font-size:13px}aside a.active{color:#215b85;background:#edf4f8;font-weight:600}article{min-width:0}button{font:inherit;cursor:pointer;border:1px solid #cbd5de;background:white;color:#215b85;padding:6px 10px;border-radius:3px}.language-note{font-size:14px;color:#52616d;border-left:3px solid #d5dce2;padding-left:10px}aside a.other-language{color:#8a959e}.next{display:flex;justify-content:space-between;margin-top:35px;border-top:1px solid #e0e5e9;padding-top:20px}.home,.gallery{padding:44px 0 70px}.home{max-width:1040px}.home>p{max-width:760px}.lead{font-size:22px;color:#596976}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:30px 22px;margin:20px 0 28px}.first-plot{max-width:820px}.gallery h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#5c6872;margin:28px 0 0}.install{max-width:820px;border-top:1px solid #e0e5e9;border-bottom:1px solid #e0e5e9;margin:30px 0;padding:0 0 12px}.install h3{font-size:15px;font-weight:600;margin:20px 0 6px}.install pre{margin:0 0 16px;padding:10px 12px;background:#f4f6f8;border:1px solid #e0e5e9;border-radius:3px;overflow-x:auto;font-size:13px;line-height:1.5}.search{display:grid;gap:6px;font-size:12px;color:#687582;max-width:380px}.search input{font:inherit;padding:8px;border:1px solid #cbd5de;width:100%;box-sizing:border-box}a:focus-visible,button:focus-visible{outline:2px solid #215b85;outline-offset:3px}.markdown :global(pre){overflow-x:auto}.markdown>:global(table){border-collapse:collapse;width:100%;margin:0 0 24px;font-size:14px;line-height:1.5}.markdown>:global(table) :global(:is(th,td)){text-align:left;vertical-align:top;padding:10px 12px 10px 0;border-top:1px solid #e0e5e9;overflow-wrap:break-word}.markdown>:global(table) :global(th){font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5c6872;border-top:0}.markdown>:global(table) :global(td:first-child){width:22%}
  @media(max-width:800px){.docs{padding:0 16px}header{flex-wrap:wrap;gap:0;padding-top:12px}header nav{gap:18px;font-size:13px}.layout{display:block;padding-top:22px}aside{position:static;max-height:180px;border-right:0;border-bottom:1px solid #e0e5e9;margin-bottom:28px;padding-bottom:12px}}
</style>
