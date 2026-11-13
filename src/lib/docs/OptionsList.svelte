<script>
  // A reference page's options (TODO 68.1: computed on the server, routes/examples/docsPages.js):
  // a component's from the options table, a set's (the mark options), a TypeScript type's members
  // (types.json), or an entry's parameters, named and described as `language` spells them.
  let { options = { sections: [] }, language = "svelte" } = $props();
  const lang = $derived(language === "python" ? "python" : "js");
  // A default as the language writes it.
  const literal = (value) => Array.isArray(value) ? `[${value.map(literal).join(", ")}]`
    : value === null ? (lang === "python" ? "None" : "null")
    : typeof value === "boolean" ? (lang === "python" ? (value ? "True" : "False") : String(value))
    : JSON.stringify(value);
  const numeric = (value) => [value].flat().every((item) => typeof item === "number");
  const sections = $derived(options.sections);
</script>

{#if sections.length}
  <section class="details options" aria-label="Options">
    <h2>{options.heading}</h2>
    {#if options.javascriptMembers && lang === "python"}<p>This table describes the JavaScript interface. Python has its own Node and resource methods, listed under “Python members” below; these member names are not Python method names.</p>{/if}
    {#if options.component && lang === "python"}<p>Keywords are snake_case.</p>{/if}
    {#each sections as section}
      {#if sections.length > 1 || section.title !== options.heading}<h3>{section.title}</h3>{/if}
      <dl>
        {#each section.options as option}
          <div id={`option-${option.key}`}>
            <dt><code>{option.name}</code><small>{option.type}</small>{#if option.setting}<small class="tag">setting</small>{/if}</dt>
            <dd>
              {option.doc}
              {#if option.default !== undefined}<span class="default">Default: <code>{literal(option.default)}</code>{option.units && numeric(option.default) ? ` ${option.units}` : ""}.</span>{/if}
              {#if option.defaultText}<span class="default">Default: {option.defaultText}.</span>{/if}
              {#if option.units && !(option.default !== undefined && numeric(option.default))}<span class="default">In {option.units}.</span>{/if}
              {#if option.required}<span class="default">Required.</span>{/if}
            </dd>
          </div>
        {/each}
      </dl>
    {/each}
  </section>
{/if}

<style>
  h2 { font-size: 20px; line-height: 1.4; font-weight: 600; margin: 30px 0 12px; }
  h3 { font-size: 15px; margin: 22px 0 6px; }
  dl { margin: 0; }
  dl > div { padding: 12px 0; border-top: 1px solid #e0e5e9; display: grid; grid-template-columns: minmax(120px, 35%) 1fr; gap: 20px; }
  dt { overflow-wrap: anywhere; }
  small { display: block; font-size: 12px; color: #6b7782; }
  .tag { display: inline-block; margin-top: 3px; padding: 0 5px; border: 1px solid #d5dce2; border-radius: 3px; }
  dd { margin: 0; font-size: 14px; }
  .default { display: block; color: #52616d; margin-top: 2px; }
  @media (max-width: 800px) { dl > div { grid-template-columns: 1fr; gap: 4px; } }
</style>
