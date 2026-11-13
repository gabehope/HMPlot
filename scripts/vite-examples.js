// Markdown/Svelte update immediately; Python builds serialize in the background.
// Each example is ready on its own (TODO 68.5): build_examples.py reports "Examples: built <id>" as
// each finishes, which answers requests waiting for that example and tells its pages
// (hmplot:examples-built). Existing builds are served at once, stale or not; a request for a file
// that does not exist yet waits for its example only, which goes next in a running build
// (static/example-builds/.priority) or gets a build of its own.
//
// Nothing waits for a restart (TODO 73.8). An example folder added while the server runs (a merge,
// a new src/examples/<id>/) is built, as a changed one is: Vite's hot update reports changed files
// only, so the watcher's add and unlink events are followed too. After the Python package or the
// builder changes, each example is built again when a page first asks for it (its old build is
// served meanwhile; the page shows the new one when it is ready). A page waiting for an example
// that a running build of every example did not start with gets it next (the builder adds it from
// .priority), or a build of its own after. And the gallery's cards get their thumbnails: the home
// and examples pages' server loads report the cards that have none (exampleData.server.js
// thumbnails, through the THUMBNAILS hook on globalThis: they run in this process). A program
// pair's thumbnail comes with its build, which is queued; a gallery program's is captured by
// scripts/build-thumbnails.mjs in a child process (its Chrome draws the program on this server),
// after the queued example builds, one run at a time (the ids asked for meanwhile wait for the
// next), at a low CPU priority, and each capture is announced (hmplot:thumbnails-built) so the page
// reloads its data. An id is asked for once until it is made: one that could not be is asked for
// again after a source file changes. Nothing is captured on a request's path, nor in CI (the
// browser suite's server stays as it was).
import { spawn } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { setPriority } from "node:os";
import path from "node:path";
import { prepareDocs } from "./docs-pages.mjs";

// The hook a docs page's server load calls with the ids of its cards that have no thumbnail.
export const THUMBNAILS = Symbol.for("hmplot:missing-thumbnails");

export function examples({ thumbnails = !process.env.CI } = {}) {
  // `scope`: the running build's ids (null: every example), else undefined.
  let pending = Promise.resolve(), server, timer, scope;
  const queued = new Set(), waiters = new Map(), first = new Set(), asked = new Set();
  // Whether the package or the builder changed since the server started, and the examples asked
  // for since.
  let outdated = false;
  const checked = new Set();
  const guide = file => /[\\/]src[\\/]routes[\\/]content[\\/]guide[\\/].*\.(md|svx)$/.test(file);
  const builder = file => /^(python[\\/]hmplot[\\/](?!.*__pycache__)|scripts[\\/]build_examples\.py$)/.test(path.relative(server.config.root, file));
  const builds = () => path.join(server.config.root, "static", "example-builds");
  const exists = id => existsSync(path.join(server.config.root, "src", "examples", id, `${id}.py`));
  const notify = data => server.ws.send({type:"custom",event:"hmplot:examples-built",data});
  // Requests waiting for an example: answered when it has built or failed, or the build ends.
  function settle(id) { for (const resolve of waiters.get(id) ?? []) resolve(); waiters.delete(id); }
  function waitFor(id) { return new Promise(resolve => waiters.set(id, [...(waiters.get(id) ?? []), resolve])); }
  function prioritize(id) {
    first.add(id);
    try { writeFileSync(path.join(builds(), ".priority"), [...first].join("\n")); } catch {}
  }
  function build(requested = []) {
    // An example removed since it was queued is left out.
    const ids = requested.filter(exists);
    if (requested.length && !ids.length) { requested.forEach(settle); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      let errors = "", output = "";
      const failed = [], reported = new Set();
      scope = ids.length ? new Set(ids) : null;
      const child = spawn(process.execPath, ["scripts/build-examples.mjs", ...ids], {cwd:server.config.root,stdio:["ignore","pipe","pipe"]});
      child.stdout.on("data",data => {
        process.stdout.write(data);
        output += data;
        for (let end = output.indexOf("\n"); end >= 0; end = output.indexOf("\n")) {
          const match = /^Examples: (built|failed) (\S+)/.exec(output.slice(0, end));
          output = output.slice(end + 1);
          if (!match) continue;
          reported.add(match[2]);
          if (match[1] === "built") { asked.delete(match[2]); notify({ids:[match[2]]}); }
          else failed.push(match[2]);
          settle(match[2]);
        }
      });
      child.stderr.on("data",data => { errors += data; process.stderr.write(data); });
      child.on("error",reject);
      child.on("exit",code => {
        // A build of every example that ended without reaching one a page asked for (asked as it
        // ended) leaves that one to a build of its own; the others' requests are answered.
        const again = [];
        for (const id of [...waiters.keys()]) {
          if (scope === null && first.has(id) && !reported.has(id)) again.push(id);
          else if (!scope || scope.has(id)) settle(id);
        }
        scope = undefined;
        first.clear();
        rmSync(path.join(builds(), ".priority"), {force:true});
        if (again.length) enqueue(again);
        if (code === 0) resolve();
        else reject(Object.assign(Error(errors.trim() || `Example build exited with ${code}`), {failed}));
      });
    });
  }
  function run(ids) {
    pending = pending.then(() => build(ids)).catch(error => {
      server.config.logger.error(error.message);
      notify({ids:error.failed?.length ? error.failed : ids, error:error.message});
    });
    return pending;
  }
  function enqueue(ids) {
    ids.forEach(id => queued.add(id)); clearTimeout(timer);
    timer = setTimeout(() => {
      const next = [...queued]; queued.clear();
      if (next.length) run(next);
    },150);
  }
  async function changedPage(file, reload = false) {
    const pages = await prepareDocs();
    enqueue(pages.find(page => path.resolve(server.config.root,page.file) === file)?.examples.map(e=>e.id) ?? []);
    if (reload) server.ws.send({type:"full-reload"});
  }
  // A source file saved, added or removed: its example (src/examples/<id>/) is built again, and the
  // thumbnails that could not be made may be asked for again. The package or the builder: every
  // example, as it is asked for.
  function changed(file) {
    if (builder(file)) { outdated = true; checked.clear(); }
    if (!/^src[\\/]/.test(path.relative(server.config.root, file))) return;
    asked.clear();
    const id = /[\\/]src[\\/]examples[\\/]([^\\/]+)[\\/]/.exec(file)?.[1];
    if (id && !id.startsWith("docs--")) enqueue([id]);
  }

  // The gallery programs' thumbnails, captured by build-thumbnails.mjs: one run at a time, after the
  // example builds queued before it; ids asked for during a run wait for the next.
  const capture = { waiting: new Set(), running: false, timer: undefined };
  function captureLater(ids) {
    ids.forEach(id => capture.waiting.add(id));
    clearTimeout(capture.timer);
    if (!capture.running) capture.timer = setTimeout(captureNext, 150);
  }
  async function captureNext() {
    // An example that has gained a Python pair since gets its thumbnail from its build.
    const ids = [...capture.waiting].filter(id => !exists(id));
    capture.waiting.clear();
    if (!ids.length) return;
    capture.running = true;
    await pending;
    await new Promise(resolve => {
      // Drawn by this server (a second one would write .svelte-kit's files again, which reloads
      // this one's pages), else by the script's own.
      const base = server.resolvedUrls?.local?.[0], args = ["scripts/build-thumbnails.mjs", ...ids];
      if (base) args.push("--base", base);
      else if (server.config.configFile) args.push("--vite-config", server.config.configFile);
      const child = spawn(process.execPath, args, {cwd:server.config.root,stdio:["ignore","pipe","pipe"]});
      // Below the server and the browser in CPU (the capture's Chrome inherits it).
      try { setPriority(child.pid, 10); } catch {}
      let output = "";
      child.stdout.on("data",data => {
        process.stdout.write(data);
        output += data;
        for (let end = output.indexOf("\n"); end >= 0; end = output.indexOf("\n")) {
          const id = /^Thumbnails: captured (\S+)/.exec(output.slice(0, end))?.[1];
          output = output.slice(end + 1);
          if (!id) continue;
          asked.delete(id);
          server.ws.send({type:"custom",event:"hmplot:thumbnails-built",data:{ids:[id]}});
        }
      });
      child.stderr.on("data",data => process.stderr.write(data));
      child.on("error",error => { server.config.logger.warn(`Thumbnails: ${error.message}`); resolve(); });
      child.on("exit",resolve);
    });
    capture.running = false;
    if (capture.waiting.size) captureLater([]);
  }
  // A docs page's cards without a thumbnail (exampleData.server.js), each id once until it is made
  // (or a source file changes). A program pair's comes with its build (unless a build of every
  // example is under way); a gallery program's is captured.
  function missingThumbnails(ids) {
    const capturing = [];
    for (const id of ids) {
      if (asked.has(id)) continue;
      asked.add(id);
      if (!exists(id)) capturing.push(id);
      else if (!(scope === null || scope?.has(id))) enqueue([id]);
    }
    if (capturing.length) captureLater(capturing);
  }

  return {
    name:"hmplot-examples", apply:"serve",
    configureServer(instance) {
      server = instance;
      // Every example whose build is missing or stale, in the background (they are skipped when
      // current).
      run([]);
      if (thumbnails) globalThis[THUMBNAILS] = missingThumbnails;
      server.middlewares.use((request,_response,next) => {
        const url = new URL(request.url ?? "/","http://localhost");
        if (!url.pathname.startsWith("/example-builds/")) return next();
        const id = /^\/example-builds\/([^/]+)\//.exec(url.pathname)?.[1];
        if (outdated && id && !checked.has(id) && exists(id)) { checked.add(id); enqueue([id]); }
        if (existsSync(path.join(server.config.root,"static",url.pathname))) return next();
        // A file that is not there yet: an example's waits for that example; another (the
        // manifest) for the builds under way.
        if (!id || !exists(id)) return pending.then(next);
        if (scope === null || scope?.has(id)) prioritize(id);
        else enqueue([id]);
        waitFor(id).then(next);
      });
      for (const event of ["add","unlink"]) server.watcher.on(event,file => {
        if (guide(file)) changedPage(file,true).catch(error => server.config.logger.error(error.message));
        else changed(file);
      });
      server.httpServer?.once("close",() => {
        clearTimeout(timer); clearTimeout(capture.timer);
        if (globalThis[THUMBNAILS] === missingThumbnails) delete globalThis[THUMBNAILS];
      });
    },
    async handleHotUpdate({file}) {
      if (guide(file)) await changedPage(file);
      else changed(file);
    },
  };
}
