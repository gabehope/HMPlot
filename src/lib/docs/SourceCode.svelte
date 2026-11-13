<script>
  let { source = "", language = "svelte", highlight = [] } = $props();
  const tokens = $derived.by(() => {
    const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|<!--[^]*?-->|\/\/[^\n]*|#[^\n]*|\b(?:import|from|const|let|with|as|def|return|await|True|False|None|if|else|for|in|async)\b|\b\d+(?:\.\d+)?\b)/g;
    return source.split("\n").map(line => line.split(pattern).filter(Boolean).map(text => ({
      text,
      kind: /^(?:<!--|\/\/)/.test(text) || (language === "python" && text.startsWith("#")) ? "comment"
        : /^["']/.test(text) ? "string" : /^\d/.test(text) ? "number"
        : /^(?:import|from|const|let|with|as|def|return|await|True|False|None|if|else|for|in|async)$/.test(text) ? "keyword" : "",
    })));
  });
</script>
<pre><code>{#each tokens as line, index}<span class="source-line" class:highlighted={highlight.includes(index + 1)}>{#each line as token}<span class={token.kind}>{token.text}</span>{/each}{index < tokens.length - 1 ? "\n" : ""}</span>{/each}</code></pre>
<style>
  pre { margin:0; padding:16px; overflow:auto; background:#f8fafb; color:#263c4a; font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace; tab-size:4; }
  .source-line.highlighted { background:#fff0b3; box-shadow: -16px 0 #fff0b3, 16px 0 #fff0b3; }
  .comment { color:#64786a; } .string { color:#98612b; } .keyword { color:#625594; } .number { color:#216c79; }
</style>
