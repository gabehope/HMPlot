import { mount } from "svelte";
import App from "./App.svelte";
import * as harness from "./workloads.js";
mount(App, { target: document.getElementById("app") });
window.primitives = harness;
