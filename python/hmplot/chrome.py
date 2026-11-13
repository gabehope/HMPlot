"""Headless Chrome for exports (R2.0c): find a browser, download one if there is none, and drive
it over Chrome's DevTools protocol with a small client of our own (the standard library only).

A browser is found in this order: the HMPLOT_CHROME path, an installed Chrome, Edge or Chromium,
then a Chrome for Testing in the user cache. With none, the first export downloads Chrome for
Testing into the cache once (about 150 MB) and says so; ``install_chrome()``
(``hmplot install-chrome``) does it ahead of time. HMPLOT_NO_DOWNLOAD=1 turns the download off.

WebGPU uses the machine's adapter; without one (servers, Docker, CI) Chrome's software adapter,
SwiftShader, draws the same output more slowly. A setup is used only once a WebGPU canvas has
drawn a few frames in it (``open_page``), and an export that loses its GPU device says which
setup it ran on (``Browser.describe``).

Chrome runs in its sandbox, except as root on Linux (where it refuses to) and when
HMPLOT_CHROME_NO_SANDBOX=1 asks; where the sandbox cannot start, the error says what to do.
"""

from __future__ import annotations

import base64
import collections
import hashlib
import json
import os
import platform
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
from pathlib import Path

ENV_CHROME = "HMPLOT_CHROME"
ENV_NO_DOWNLOAD = "HMPLOT_NO_DOWNLOAD"
# Set (to anything but "" or "0"), Chrome runs without its sandbox: an opt-in for systems where the
# sandbox cannot start (see _SANDBOX_MESSAGE). The sandbox contains a compromised renderer, and the
# export browser loads the scene's remote URLs, so it is off only when asked (or as root, below).
ENV_NO_SANDBOX = "HMPLOT_CHROME_NO_SANDBOX"
VERSIONS_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"


# -- Finding a browser ----------------------------------------------------------------------------

def cache_dir() -> Path:
    """Where downloaded browsers live: the user cache, under hmplot/chrome-for-testing."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Caches"
    elif sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    return base / "hmplot" / "chrome-for-testing"


def _cft_platform():
    """Chrome for Testing's name for this platform, or None (it has no Linux ARM64 build)."""
    machine = platform.machine().lower()
    if sys.platform == "darwin":
        return "mac-arm64" if machine in ("arm64", "aarch64") else "mac-x64"
    if sys.platform == "win32":
        return "win64" if machine.endswith("64") else "win32"
    if sys.platform.startswith("linux") and machine in ("x86_64", "amd64"):
        return "linux64"
    return None


def _installed():
    """Installed Chrome, Edge and Chromium executables, most likely first."""
    if sys.platform == "darwin":
        apps = ["Google Chrome", "Chromium", "Microsoft Edge", "Google Chrome Canary"]
        roots = [Path("/Applications"), Path.home() / "Applications"]
        return [root / f"{app}.app" / "Contents" / "MacOS" / app for app in apps for root in roots]
    if sys.platform == "win32":
        roots = [os.environ.get(key) for key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
        tails = [Path("Google/Chrome/Application/chrome.exe"), Path("Microsoft/Edge/Application/msedge.exe"),
                 Path("Chromium/Application/chrome.exe")]
        return [Path(root) / tail for tail in tails for root in roots if root]
    names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]
    return [Path(found) for found in map(shutil.which, names) if found]


def _executable(folder, target):
    """Where Chrome for Testing's executable is in its unpacked download."""
    if target.startswith("mac"):
        return folder / f"chrome-{target}" / "Google Chrome for Testing.app" / "Contents" / "MacOS" / "Google Chrome for Testing"
    return folder / f"chrome-{target}" / ("chrome.exe" if target.startswith("win") else "chrome")


def _cached():
    """The newest downloaded Chrome for Testing in the cache, or None."""
    target = _cft_platform()
    if target is None or not cache_dir().is_dir():
        return None
    found = [path for folder in cache_dir().iterdir() if (path := _executable(folder, target)).is_file()]
    return max(found, key=lambda p: _version_key(p.relative_to(cache_dir()).parts[0])) if found else None


def _version_key(text):
    return tuple(int(part) if part.isdigit() else 0 for part in text.split("."))


def find_chrome(*, download=True) -> Path:
    """A Chrome to export with (see the module docstring for the order). With none installed and
    ``download`` true, Chrome for Testing is downloaded into the cache first, unless
    HMPLOT_NO_DOWNLOAD is set."""
    explicit = os.environ.get(ENV_CHROME)
    if explicit:
        path = Path(explicit).expanduser()
        if not path.is_file():
            raise RuntimeError(f"{ENV_CHROME} is {explicit!r}, which is not a file.")
        return path
    for path in _installed():
        if path.is_file():
            return path
    cached = _cached()
    if cached:
        return cached
    if not download or os.environ.get(ENV_NO_DOWNLOAD, "").strip() not in ("", "0"):
        raise RuntimeError(_missing_message())
    return install_chrome()


def _missing_message():
    lines = ["hmplot exports need Chrome, Edge or Chromium, and found none."]
    if _cft_platform() is None:
        lines.append("Install your distribution's Chromium (on Debian and Ubuntu: apt-get install chromium).")
    else:
        lines.append("Install one, set HMPLOT_CHROME to its executable, or run `hmplot install-chrome` "
                     "to download Chrome for Testing (about 150 MB) into the user cache.")
    if os.environ.get(ENV_NO_DOWNLOAD, "").strip() not in ("", "0"):
        lines.append(f"{ENV_NO_DOWNLOAD} is set, so it was not downloaded automatically.")
    return " ".join(lines)


def install_chrome(*, force=False, quiet=False) -> Path:
    """Download Chrome for Testing into the user cache (about 150 MB, once) and return its
    executable. The version is the newest known-good Stable one. (Its headless shell is smaller,
    but its WebGPU does not work.)"""
    target = _cft_platform()
    if target is None:
        raise RuntimeError(_missing_message())
    say = (lambda message: None) if quiet else (lambda message: print(message, file=sys.stderr, flush=True))
    with urllib.request.urlopen(VERSIONS_URL, timeout=60) as response:
        stable = json.load(response)["channels"]["Stable"]
    version = stable["version"]
    url = next(item["url"] for item in stable["downloads"]["chrome"] if item["platform"] == target)
    folder = cache_dir() / version
    executable = _executable(folder, target)
    if executable.is_file() and not force:
        return executable
    say(f"hmplot: downloading Chrome for Testing {version} ({target}) into {folder}, once.")
    folder.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=folder) as scratch:
        archive = Path(scratch) / "chrome.zip"
        with urllib.request.urlopen(url, timeout=60) as response, open(archive, "wb") as out:
            total, done, shown = int(response.headers.get("Content-Length") or 0), 0, -1
            while chunk := response.read(1 << 20):
                out.write(chunk)
                done += len(chunk)
                if total and done * 10 // total != shown:
                    shown = done * 10 // total
                    say(f"hmplot: {done >> 20} of {total >> 20} MB")
        with zipfile.ZipFile(archive) as zipped:
            for info in zipped.infolist():
                mode, path = info.external_attr >> 16, folder / info.filename
                if mode & 0o170000 == 0o120000:
                    # A symbolic link (macOS app bundles are full of them); zipfile would write a
                    # file holding the target's name.
                    path.parent.mkdir(parents=True, exist_ok=True)
                    if path.is_symlink() or path.exists():
                        path.unlink()
                    os.symlink(zipped.read(info).decode(), path)
                    continue
                zipped.extract(info, folder)
                # zipfile drops the permission bits; the executables need theirs back.
                if mode:
                    os.chmod(path, mode)
    if not executable.is_file():
        raise RuntimeError(f"The Chrome for Testing download has no {executable.name}.")
    say(f"hmplot: Chrome for Testing is at {executable}.")
    return executable


# -- The DevTools protocol -------------------------------------------------------------------------

class _WebSocket:
    """A minimal WebSocket client (RFC 6455) for the DevTools endpoint: text frames, masked on
    the way out, fragmented or not on the way in."""

    def __init__(self, host, port, path, timeout=300):
        self.timeout = timeout
        self.sock = socket.create_connection((host, port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
                           f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("Chrome closed the DevTools connection during the handshake.")
            head += chunk
        header, self.buffer = head.split(b"\r\n\r\n", 1)
        if b" 101 " not in header.split(b"\r\n", 1)[0]:
            raise RuntimeError(f"Chrome refused the DevTools connection: {header.splitlines()[0].decode(errors='replace')}")
        accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        if accept not in header:
            raise RuntimeError("Chrome's DevTools handshake did not match.")

    def _exact(self, count):
        while len(self.buffer) < count:
            chunk = self.sock.recv(max(1 << 16, count - len(self.buffer)))
            if not chunk:
                raise RuntimeError("Chrome closed the DevTools connection.")
            self.buffer += chunk
        data, self.buffer = self.buffer[:count], self.buffer[count:]
        return data

    def _frame(self, opcode, payload):
        size = len(payload)
        head = bytes([0x80 | opcode])
        if size < 126:
            head += bytes([0x80 | size])
        elif size < 1 << 16:
            head += bytes([0x80 | 126]) + struct.pack(">H", size)
        else:
            head += bytes([0x80 | 127]) + struct.pack(">Q", size)
        mask = os.urandom(4)
        # XOR through one big integer: fast for payloads of many megabytes.
        repeated = (mask * (size // 4 + 1))[:size]
        masked = (int.from_bytes(payload, "little") ^ int.from_bytes(repeated, "little")).to_bytes(size, "little")
        self.sock.sendall(head + mask + masked)

    def send(self, text):
        self._frame(0x1, text.encode())

    def receive(self):
        message, opcode = b"", None
        while True:
            first, second = self._exact(2)
            op, size = first & 0x0F, second & 0x7F
            if size == 126:
                size = struct.unpack(">H", self._exact(2))[0]
            elif size == 127:
                size = struct.unpack(">Q", self._exact(8))[0]
            mask = self._exact(4) if second & 0x80 else None
            payload = self._exact(size)
            if mask:
                repeated = (mask * (size // 4 + 1))[:size]
                payload = (int.from_bytes(payload, "little") ^ int.from_bytes(repeated, "little")).to_bytes(size, "little")
            if op == 0x8:
                raise RuntimeError("Chrome closed the DevTools connection.")
            if op == 0x9:
                self._frame(0xA, payload)
                continue
            if op == 0xA:
                continue
            if op != 0x0:
                opcode = op
            message += payload
            if first & 0x80 and opcode is not None:
                return message.decode()

    def close(self):
        try:
            self._frame(0x8, b"")
        except OSError:
            pass
        self.sock.close()


# SwiftShader's WebGPU on Linux. Without a GPU, Chrome there composites in software (or, asked
# to, on SwiftShader's GL through ANGLE), and neither has a shared image a WebGPU canvas can draw
# into: the canvas's first frame lost the device ("Could not find SharedImageBackingFactory with
# params: usage: ...WebgpuSwapChainTexture...", "Device was destroyed"; every headless export on
# GitHub's Linux runners, Chrome 154, 2026-10-02). With these, Chrome's compositor (Skia) runs on
# SwiftShader's Vulkan, whose images a canvas can draw into, and ANGLE on SwiftShader. Measured
# on the runners (TESTING.md, "CI fixes (2026-10-02)"): each of the three is needed; ANGLE on
# Vulkan (--use-angle=vulkan) cannot start there, which stops the GPU process, and
# --disable-vulkan-surface turns GPU compositing off again.
LINUX_SWIFTSHADER_FLAGS = ["--enable-features=Vulkan", "--use-vulkan=swiftshader", "--use-angle=swiftshader"]

# SwiftShader's WebGPU on Windows. Without a GPU, Chrome there blocklists the only adapter,
# Microsoft's software Direct3D (WARP, "Microsoft Basic Render Driver"): it composites in
# software and offers no WebGPU adapter at all, SwiftShader's included (GitHub's Windows runners,
# Chrome 154, 2026-10-02). Asked to run ANGLE on WARP, it composites there, and SwiftShader's
# WebGPU draws (TESTING.md, "CI fixes (2026-10-02)").
WINDOWS_SWIFTSHADER_FLAGS = ["--use-angle=d3d11-warp"]

# What Chrome's log says about the GPU, for the errors below; its other lines (display links,
# D-Bus, sign-in) are noise there.
_GPU_LOG = re.compile(r"gpu|webgpu|dawn|vulkan|swiftshader|shared_?image|angle|\bgl\b", re.I)


class Browser:
    """One headless Chrome process and its DevTools connection."""

    def __init__(self, executable=None, *, swiftshader=False):
        self.executable = Path(executable) if executable else find_chrome()
        self.swiftshader = swiftshader
        self.adapter = None  # the WebGPU adapter open_page drew with: vendor, architecture
        self.profile = tempfile.TemporaryDirectory(prefix="hmplot-chrome-")
        args = [str(self.executable), "--headless=new", "--remote-debugging-port=0",
                f"--user-data-dir={self.profile.name}", "--no-first-run", "--no-default-browser-check",
                "--disable-extensions", "--disable-background-networking", "--disable-sync",
                "--hide-scrollbars", "--mute-audio", "--enable-unsafe-webgpu", "about:blank"]
        if swiftshader:
            args[-1:-1] = ["--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader"]
            if sys.platform.startswith("linux"):
                args[-1:-1] = LINUX_SWIFTSHADER_FLAGS
            elif sys.platform == "win32":
                args[-1:-1] = WINDOWS_SWIFTSHADER_FLAGS
        if (sys.platform.startswith("linux") and hasattr(os, "geteuid") and os.geteuid() == 0) or \
                os.environ.get(ENV_NO_SANDBOX, "").strip() not in ("", "0"):
            # Chrome's sandbox refuses to run as root (Docker's default user); elsewhere only on request.
            args[-1:-1] = ["--no-sandbox"]
        self.args = args
        self.socket = None
        self.next_id = 0
        self.events = []
        self.process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.PIPE)
        # Chrome's log, read as it is written: an unread pipe fills (64 KB on Linux) and then
        # blocks whichever Chrome process writes next, and its last lines explain a failure.
        self.log = collections.deque(maxlen=400)
        self._log_reader = threading.Thread(target=self._read_log, daemon=True)
        self._log_reader.start()
        try:
            port, path = self._endpoint()
            self.socket = _WebSocket("127.0.0.1", port, path)
        except BaseException:
            self.close()
            raise

    def _read_log(self):
        for line in iter(self.process.stderr.readline, b""):
            self.log.append(line.decode(errors="replace").rstrip())

    def _endpoint(self, timeout=60):
        active = Path(self.profile.name) / "DevToolsActivePort"
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                self._log_reader.join(timeout=2)
                log = [line for line in self.log.copy() if line.strip()]
                if any("No usable sandbox" in line for line in log):
                    raise RuntimeError(_SANDBOX_MESSAGE.format(executable=self.executable))
                raise RuntimeError(f"Chrome ({self.executable}) exited at launch: " + " / ".join(log[-5:]))
            try:
                lines = active.read_text().split()
            except OSError:
                # Not written yet, or (Windows) still open in Chrome, which shares no access
                # while it writes: try again.
                lines = []
            if len(lines) >= 2:
                return int(lines[0]), lines[1]
            time.sleep(0.05)
        raise RuntimeError(f"Chrome ({self.executable}) did not open its DevTools port in {timeout} s.")

    def gpu_log(self, count=8):
        """The last ``count`` lines of Chrome's log about the GPU (without their process, thread
        and time stamp, and cut at 300 characters)."""
        lines = [re.sub(r"^\[[\d:/.]+:", "[", line)[:300] for line in self.log.copy() if _GPU_LOG.search(line)]
        return lines[-count:]

    def describe(self):
        """Which Chrome an export ran in, on which WebGPU setup (flags and adapter), and the last
        GPU lines of its log: what a lost GPU device needs to be diagnosed."""
        version = ""
        try:
            version = f" {self.call('Browser.getVersion', timeout=5).get('product', '')}"
        except (RuntimeError, OSError):
            pass
        flags = [arg for arg in self.args[1:-1] if not arg.startswith("--user-data-dir=")]
        text = (f"Chrome: {self.executable}{version}, WebGPU on "
                f"{'SwiftShader' if self.swiftshader else 'the machine adapter'}"
                f" (adapter: {self.adapter or 'unknown'}), flags: {' '.join(flags)}.")
        log = self.gpu_log()
        return text + (" Chrome's GPU log: " + " | ".join(log) if log else "")

    def call(self, method, params=None, session=None, timeout=None):
        """Send a DevTools command and return its result. ``timeout`` (seconds) bounds the
        wait, for calls on the way out; a timeout leaves the connection unusable."""
        if self.socket is None:
            raise RuntimeError(f"{method}: Chrome's DevTools connection is not open.")
        self.next_id += 1
        message = {"id": self.next_id, "method": method, "params": params or {}}
        if session:
            message["sessionId"] = session
        if timeout:
            self.socket.sock.settimeout(timeout)
        try:
            self.socket.send(json.dumps(message))
            while True:
                reply = json.loads(self.socket.receive())
                if reply.get("id") == self.next_id:
                    if "error" in reply:
                        raise RuntimeError(f"{method}: {reply['error'].get('message')}")
                    return reply.get("result", {})
                if "method" in reply:
                    self.events.append(reply)
                    del self.events[:-200]
        finally:
            if timeout:
                self.socket.sock.settimeout(self.socket.timeout)

    def new_page(self, width=1200, height=800):
        # A window of its own: a background tab would get no animation frames, and a plot draws
        # in them.
        target = self.call("Target.createTarget", {"url": "about:blank", "newWindow": True, "background": False})["targetId"]
        session = self.call("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        page = Page(self, target, session)
        page.call("Page.enable")
        page.call("Emulation.setFocusEmulationEnabled", {"enabled": True})
        page.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
        return page

    def close(self):
        """Quit Chrome and delete its profile. Never raises for the profile: a cleanup error
        must not hide the error an export is leaving with."""
        if self.socket is not None:
            # Asked to, Chrome quits in order: its profile written, its child processes ended.
            try:
                self.call("Browser.close", timeout=5)
            except (RuntimeError, OSError):
                pass  # (it may close the connection before it replies)
            self.socket.close()
            self.socket = None
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                pass
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=10)
        # The log ends when every Chrome process has closed it (child processes outlive the
        # browser for a moment); one still writing keeps the pipe, and the reader, alive.
        self._log_reader.join(timeout=5)
        if not self._log_reader.is_alive():
            self.process.stderr.close()
        _remove_profile(self.profile)


# Chrome for Testing on Ubuntu 23.10 and later (and other systems that restrict unprivileged user
# namespaces with AppArmor): its sandbox cannot start, and Chrome quits. hmplot never turns the
# sandbox off on its own.
_SANDBOX_MESSAGE = (
    "Chrome ({executable}) cannot start its sandbox (\"No usable sandbox!\"): this system restricts "
    "the unprivileged user namespaces the sandbox needs (Ubuntu 23.10 and later do, with AppArmor), and "
    "this Chrome has no AppArmor profile that allows them. Install Google Chrome from its .deb package "
    "(its AppArmor profile lets the sandbox start; hmplot finds google-chrome on the PATH, or set "
    f"{ENV_CHROME} to it), or set {ENV_NO_SANDBOX}=1 to run Chrome without its sandbox, accepting that "
    "a compromised page (the export browser loads the scene's remote URLs: tiles, images, Providers) "
    "would run with your user's rights."
)


def _remove_profile(profile, timeout=10):
    """Delete a Chrome profile (a TemporaryDirectory). Chrome's child processes can still write
    into it for a moment after the browser exits ("Directory not empty" on Linux), and Windows
    refuses to delete a file a process holds open: retry until ``timeout`` seconds, then leave
    what is left in the temporary directory."""
    deadline = time.monotonic() + timeout
    while True:
        try:
            profile.cleanup()
            return
        except OSError:
            if time.monotonic() > deadline:
                shutil.rmtree(profile.name, ignore_errors=True)
                return
            time.sleep(0.1)


class Page:
    """A tab: navigate, evaluate a function with an argument, print to PDF."""

    def __init__(self, browser, target, session):
        self.browser, self.target, self.session = browser, target, session

    def call(self, method, params=None):
        return self.browser.call(method, params, self.session)

    def goto(self, url, timeout=60):
        self.call("Page.navigate", {"url": url})
        self.wait_for("document.readyState !== 'loading'", timeout)

    def set_content(self, html, timeout=60):
        """Replace the document with ``html`` and wait for it and its fonts to load."""
        frame = self.call("Page.getFrameTree")["frameTree"]["frame"]["id"]
        self.call("Page.setDocumentContent", {"frameId": frame, "html": html})
        self.wait_for("document.readyState === 'complete'", timeout)
        self.evaluate("() => document.fonts.ready.then(() => true)")

    def evaluate(self, function, arg=None):
        """Call the JavaScript function source ``function`` with ``arg`` (JSON) and return its
        (awaited) result by value. A thrown error becomes a RuntimeError with its message."""
        this = self.call("Runtime.evaluate", {"expression": "globalThis"})["result"]["objectId"]
        result = self.call("Runtime.callFunctionOn", {
            "functionDeclaration": function, "objectId": this, "arguments": [{"value": arg}],
            "awaitPromise": True, "returnByValue": True,
        })
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            text = details.get("exception", {}).get("description") or details.get("text") or "JavaScript error"
            if _DEVICE_LOST.search(text):
                text += f"\n{self.browser.describe()}"
            raise RuntimeError(f"Page.evaluate: {text}")
        return result["result"].get("value")

    def wait_for(self, expression, timeout=60):
        """Poll until the JavaScript ``expression`` is truthy."""
        deadline = time.monotonic() + timeout
        while True:
            value = self.call("Runtime.evaluate", {"expression": f"Boolean({expression})", "returnByValue": True})
            if value.get("result", {}).get("value"):
                return
            if time.monotonic() > deadline:
                raise RuntimeError(f"Timed out after {timeout} s waiting for {expression}.")
            time.sleep(0.05)

    def pdf(self, width_px, height_px):
        """The page printed to one PDF page of ``width_px`` x ``height_px`` CSS pixels."""
        result = self.call("Page.printToPDF", {
            "paperWidth": width_px / 96, "paperHeight": height_px / 96, "printBackground": True,
            "marginTop": 0, "marginBottom": 0, "marginLeft": 0, "marginRight": 0,
            "pageRanges": "1", "preferCSSPageSize": True,
        })
        return base64.b64decode(result["data"])

    def close(self):
        try:
            self.browser.call("Target.closeTarget", {"targetId": self.target})
        except RuntimeError:
            pass


# How a lost GPU device reads in an error from the page (the runtime's, three.js's or Dawn's).
_DEVICE_LOST = re.compile(r"device (was )?lost|device was destroyed|instance dropped|"
                          r"instance reference no longer exists|GPU connection lost", re.I)

# Whether WebGPU can draw in the page: a canvas shows a few frames on its own device. An adapter
# alone is not enough: where Chrome cannot show a WebGPU canvas, the first frame loses the device
# (headless Chrome on GitHub's Linux runners without LINUX_SWIFTSHADER_FLAGS; on a Mac with
# --disable-gpu). Resolves to {adapter, reason}; reason is null when it drew.
_DRAW_CHECK = """async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return { adapter: null, reason: "no WebGPU adapter" };
  const info = adapter.info ?? {};
  const name = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || "unnamed";
  let device, canvas, lost = null;
  const errors = [], draw = async () => {
    device = await adapter.requestDevice();
    device.lost.then((event) => { lost = event.message || event.reason; });
    device.onuncapturederror = (event) => errors.push(event.error.message);
    canvas = Object.assign(document.createElement("canvas"), { width: 16, height: 16 });
    document.body.append(canvas);
    const context = canvas.getContext("webgpu");
    context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: "premultiplied" });
    for (let frame = 0; frame < 4 && !lost && !errors.length; frame++) {
      const encoder = device.createCommandEncoder();
      encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(),
        loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] }).end();
      device.queue.submit([encoder.finish()]);
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    }
    await device.queue.onSubmittedWorkDone();
    await new Promise((resolve) => setTimeout(resolve, 50));
  };
  try {
    await Promise.race([draw(), new Promise((_, reject) => setTimeout(() => reject(Error("timed out after 30 s")), 30000))]);
  } catch (error) {
    errors.push(error?.message ?? String(error));
  } finally {
    canvas?.remove();
  }
  const reason = lost ? `the device was lost: ${lost}` : errors[0] ?? null;
  if (!reason) device.destroy();
  return { adapter: name, reason };
}"""


def open_page(url, ready, *, executable=None, timeout=60):
    """A headless Chrome at ``url`` once the JavaScript ``ready`` is true, where WebGPU draws:
    on the machine's adapter, else on SwiftShader's (``_DRAW_CHECK``). Returns (browser, page).
    With neither, the error says how each setup failed, with its flags and Chrome's GPU log."""
    failures = []
    for swiftshader in (False, True):
        browser = Browser(executable, swiftshader=swiftshader)
        try:
            page = browser.new_page()
            page.goto(url, timeout)
            page.wait_for(ready, timeout)
            drawn = page.evaluate(_DRAW_CHECK)
            browser.adapter = drawn["adapter"]
            if not drawn["reason"]:
                return browser, page
            failures.append(f"{'SwiftShader' if browser.swiftshader else 'The machine adapter'}: {drawn['reason'].rstrip('.')}. "
                            f"{browser.describe()}")
        except BaseException:
            browser.close()
            raise
        browser.close()
    raise RuntimeError("Chrome found no WebGPU adapter that draws, not even SwiftShader's.\n" + "\n".join(failures))


def main(argv=None):
    """The `hmplot` command (also `python -m hmplot`): `hmplot install-chrome` downloads Chrome for
    Testing into the user cache ahead of time; `hmplot check FILE.py` renders a program's plot
    headlessly and reports what it drew (checking.py). Returns the exit status."""
    import argparse
    argv = sys.argv[1:] if argv is None else list(argv)
    if argv[:1] == ["check"]:
        from .checking import main as check
        return check(argv[1:])
    parser = argparse.ArgumentParser(prog="hmplot")
    commands = parser.add_subparsers(dest="command", required=True)
    install = commands.add_parser("install-chrome", help="Download Chrome for Testing for exports.")
    install.add_argument("--force", action="store_true", help="Download again even if cached.")
    commands.add_parser("find-chrome", help="Print the browser exports would use.")
    commands.add_parser("check", help="Render a program's plot headlessly and report what it drew "
                        "(hmplot check FILE.py; hmplot check -h for its options).")
    options = parser.parse_args(argv)
    if options.command == "install-chrome":
        print(install_chrome(force=options.force))
    else:
        print(find_chrome(download=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
