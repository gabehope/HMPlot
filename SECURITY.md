# Security

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

- through GitHub's private vulnerability reporting on this repository ("Report a vulnerability"
  under the Security tab), or
- by email to [INSERT CONTACT ADDRESS].

Include what is affected, how to reproduce it, and what an attacker could do with it. You will
get an answer within a week, and a fix or a plan within 30 days for a confirmed issue.

**Reports must be verified by a person.** Automated or AI-generated reports are welcome only
when someone has reproduced the issue and checked the report's claims; unverified reports are
closed.

## Supported versions

Security fixes go into the latest 0.x release.

## Scope

HMPlot runs in the browser and in Python notebooks. Examples of what is in scope: code execution
from a crafted scene or data file, a Python scene that reaches outside its notebook, and the
standalone exporter's local server or browser being reachable from outside the machine.

## The export browser

Python's standalone exports (`hm.export_png`, `export_svg`, `export_pdf`, `export_html`,
`export_mp4`, and a notebook's static images without WebGPU) draw in a private headless Chrome
(docs/DOCUMENT-EXPORT.md, "The export browser"). What to know:

- It runs with `--enable-unsafe-webgpu`, and without a usable GPU with SwiftShader's software
  adapter (`--use-webgpu-adapter=swiftshader --enable-unsafe-swiftshader`): more of Chrome's GPU
  code is exposed to the page than in a default browser.
- It fetches the remote URLs the scene names (vector tiles, images, Providers): exporting a
  scene you did not write makes the requests it asks for.
- Chrome's sandbox is on, except as root on Linux, where Chrome refuses it (Docker's default
  user), and when `HMPLOT_CHROME_NO_SANDBOX=1` asks (for systems where the sandbox cannot start,
  such as Chrome for Testing on Ubuntu 23.10 and later). Without the sandbox, a page that exploits
  a bug in Chrome runs with your user's rights.
- The loopback server that serves the export page listens on 127.0.0.1 and answers only under a
  random per-session token in its path. Chrome's DevTools port is a random port on 127.0.0.1
  without a token: while an export runs, another local user or process that finds it could drive
  that browser. Neither port is reachable from other machines.
