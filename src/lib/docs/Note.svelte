<script>let { children, title = "Note" } = $props();</script>
<aside class="note"><strong>{title}</strong>{@render children?.()}</aside>
<style>.note{border-left:3px solid #3978a4;background:#f1f7fb;padding:12px 18px;margin:20px 0}.note :global(p:last-child){margin-bottom:0}</style>
