<script>import Note from "./Note.svelte"; let { children, title = "Warning" } = $props();</script>
<Note {title}>{@render children?.()}</Note>
