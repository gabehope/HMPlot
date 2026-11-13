import { mount } from "svelte";
import App from "./App.svelte";
import { tileAt } from "hmplot/tiles";
// The vector-tile helpers are a subpath of their own (R2.0).
window.tileAt = tileAt([0, 0], 1);
mount(App, { target: document.getElementById("app") });
