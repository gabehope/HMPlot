from pathlib import Path
import asyncio
import os
import threading
import warnings
import anywidget
import traitlets
from ipywidgets import Widget, widget_serialization
from . import exporter

# Set (to anything but "" or "0"), a displayed scene's output also carries its SVG, for notebook
# viewers without the widget (GitHub, nbviewer, notebooks exported to HTML). Off by default: each
# display then draws the scene in a headless Chrome, which takes seconds (TODO 71).
ENV_NOTEBOOK_SVG = "HMPLOT_NOTEBOOK_SVG"


def notebook_svg():
    """Whether HMPLOT_NOTEBOOK_SVG asks for an SVG in each display's output."""
    return os.environ.get(ENV_NOTEBOOK_SVG, "").strip() not in ("", "0")


class ColumnWidget(Widget):
    descriptor = traitlets.Dict().tag(sync=True)
    payload = traitlets.Bytes().tag(sync=True)


class SceneWidget(anywidget.AnyWidget):
    _esm = Path(__file__).with_name("static") / "widget.js"
    state = traitlets.Dict().tag(sync=True)
    columns = traitlets.Dict().tag(sync=True, **widget_serialization)

    def __init__(self, scene):
        if not (Path(__file__).with_name("static") / "widget.js").exists():
            from .core import SceneError
            raise SceneError(
                "The HMPlot frontend is missing. Install a built wheel or run npm run build:python.",
                code="bridge.frontend_unavailable",
                suggestion="Reinstall the wheel and restart the notebook kernel.",
            )
        self.inflight = None
        self.waiters = []
        self.activated = False
        self.waiting = None
        self.scene = scene
        self.resources = {}
        self.retired = []
        self.command_phases = {}
        self.transport_diagnostic = None
        # Views in browsers without WebGPU, each with its width (CSS pixels), and the newest
        # published snapshot they are drawn from (TODO 71).
        self.snapshot_views = {}
        self.snapshot_source = None
        self.snapshot_loop = None
        super().__init__()
        self.on_msg(self._receive)

    def publish(self, state, columns):
        # A view without WebGPU gets a static image of each new revision, debounced (TODO 71).
        self.snapshot_source = (state, columns)
        if self.snapshot_views:
            self._schedule_snapshots()
        if not self.activated:
            self.waiting = (state, columns)
            self.state = state
            return
        if self.inflight is not None:
            self.waiting = (state, columns)
            return
        self.inflight = state["revision"]
        next_resources = {}
        for key, col in columns.items():
            next_resources[key] = self.resources.get(key) or ColumnWidget(
                descriptor=col.descriptor(), payload=col.payload
            )
        self.retired.extend(
            (state["revision"], v)
            for k, v in self.resources.items()
            if k not in next_resources
        )
        self.resources = next_resources
        with self.hold_sync():
            self.columns = next_resources
            self.state = state

    def _receive(self, widget, message, buffers):
        from .core import SceneError

        if message.get("type") == "snapshot_request":
            self._snapshot_request(message)
            return
        if message.get("type") == "standalone_request":
            self._send_standalone(message)
            return
        if message.get("type") == "plugin_request":
            self._send_plugin(message)
            return
        if message.get("type") == "dispose":
            self.snapshot_views.pop(message.get("view"), None)
        if message.get("type") == "capabilities" and message.get("ready"):
            if message.get("protocol") != 1 or message.get("library") != self.state.get(
                "library"
            ):
                self.scene.error = "Notebook frontend version mismatch. Reinstall the wheel and restart the kernel."
                self.send({"type": "error", "message": self.scene.error})
                return
            self.activated = True
            if self.waiting:
                state, columns = self.waiting
                self.waiting = None
                self.publish(state, columns)
        self.scene._receive(message, buffers)
        kind = message.get("type")
        if kind in ("ack", "error"):
            revision = message.get("revision", 0)
            remaining = []
            for wanted, view, future in self.waiters:
                if message.get("view") == view and revision >= wanted:
                    diagnostic = message.get("diagnostic") or {}
                    error = (
                        SceneError(
                            message.get("message", "Preparation failed"),
                            code=message.get("code", "bridge.preparation_failed"),
                            target=message.get("target"),
                            revision=revision,
                            **{
                                key: diagnostic.get(key)
                                for key in (
                                    "component", "property", "scope", "field",
                                    "shape", "suggestion", "details",
                                )
                            },
                        )
                        if kind == "error"
                        else None
                    )
                    future.get_loop().call_soon_threadsafe(
                        self.scene._finish_future, future, None, error
                    )
                else:
                    remaining.append((wanted, view, future))
            self.waiters = remaining
            if revision == self.inflight:
                self.inflight = None
                if self.waiting:
                    state, columns = self.waiting
                    self.waiting = None
                    self.publish(state, columns)
        if kind == "ack":
            view = self.scene._views.get(message.get("view"))
            if view is not None:
                view["revision"] = message.get("revision", 0)
        request = message.get("request")
        if request and message.get("phase"):
            self.command_phases[request] = message["phase"]
        if kind in ("result", "error") and request:
            self.command_phases.pop(request, None)
        if kind in ("ack", "dispose"):
            minimum = min(
                (
                    v.get("revision", 0)
                    for v in self.scene._views.values()
                    if v.get("ready")
                ),
                default=self.scene.revision,
            )
            remaining = []
            for revision, column in self.retired:
                if revision <= minimum:
                    column.close()
                else:
                    remaining.append((revision, column))
            self.retired = remaining

    def _send_standalone(self, message):
        """A view exporting HTML asks for the standalone runtime the page embeds (TODO 54): the
        widget's bundle does not contain it, and a notebook front end cannot reach the file."""
        content = {"type": "standalone", "protocol": 1, "scene": self.scene.id,
                   "view": message.get("view"), "request": message.get("request")}
        try:
            buffers = [(Path(__file__).with_name("static") / "standalone.js").read_bytes()]
        except OSError:
            content["error"] = ("The standalone HTML frontend is missing from this installation. Install a "
                                "built wheel or run npm run build:python.")
            buffers = []
        self.send(content, buffers)

    def _send_plugin(self, message):
        """A view loading the scene's plugins asks for one's file (TODO 138.4): read from its
        installed package as it is now; the view checks it against the hash the state names. A
        plugin this process does not use (or whose file is gone) sends nothing, and the view warns
        plugin.missing."""
        from .plugins import used

        content = {"type": "plugin", "protocol": 1, "scene": self.scene.id,
                   "view": message.get("view"), "request": message.get("request")}
        plugin = used(message.get("name"))
        try:
            buffers = [plugin.read()] if plugin is not None else []
        except OSError:
            buffers = []
        self.send(content, buffers)

    def _snapshot_request(self, message):
        """A view without WebGPU asks for a static image of the scene at its width (TODO 71). It
        is drawn on the snapshot thread and sent back on this thread's event loop."""
        width = message.get("width")
        valid = isinstance(width, (int, float)) and not isinstance(width, bool) and 0 < width <= 16384
        self.snapshot_views[message.get("view")] = round(width) if valid else None
        try:
            self.snapshot_loop = asyncio.get_running_loop()
        except RuntimeError:
            self.snapshot_loop = None
        self._schedule_snapshots(0)

    def _schedule_snapshots(self, delay=None):
        exporter.SNAPSHOTS.submit(self, self._draw_snapshots, delay)

    def _draw_snapshots(self, session):
        """On the snapshot thread: draw the newest revision once per width the views without
        WebGPU have, and send each view its SVG, or why there is none. It never downloads Chrome:
        the reason then says what to install."""
        source, views = self.snapshot_source, dict(self.snapshot_views)
        if source is None or not views or self.comm is None:
            return
        state, columns = source
        for width in set(views.values()):
            content, buffers = {"type": "snapshot", "revision": state["revision"]}, []
            try:
                buffers = [exporter._snapshot_svg(session, source, width, download=False)]
            except Exception as error:
                # The first line: a browser error's JavaScript stack follows it.
                content["error"] = (str(error).strip().splitlines() or [type(error).__name__])[0]
            for view in (view for view, wanted in views.items() if wanted == width):
                self._send_snapshot({**content, "protocol": 1, "scene": self.scene.id, "view": view}, buffers)

    def _send_snapshot(self, content, buffers):
        def send():
            if self.comm is not None and content["view"] in self.snapshot_views:
                self.send(content, buffers)
        loop = self.snapshot_loop
        if loop is not None and loop.is_running():
            loop.call_soon_threadsafe(send)
        else:
            send()

    def display_svg(self):
        """The scene's SVG for a display's output (HMPLOT_NOTEBOOK_SVG, TODO 71), drawn now on the
        snapshot thread; None, with a warning, when it cannot be drawn."""
        source = self.snapshot_source
        try:
            return exporter.SNAPSHOTS.call(lambda session: exporter._snapshot_svg(session, source)).decode("utf-8")
        except Exception as error:
            warnings.warn(f"The notebook output has no SVG of the scene: {error}", RuntimeWarning, stacklevel=2)
            return None

    async def when_accepted(self, revision, view):
        if self.scene._views.get(view, {}).get("revision", 0) >= revision:
            return
        future = asyncio.get_running_loop().create_future()
        item = (revision, view, future)
        self.waiters.append(item)
        try:
            await future
        finally:
            if item in self.waiters:
                self.waiters.remove(item)

    def _dispatch_own_message(self, kernel, raw, comm_id):
        identities, packed = kernel.session.feed_identities(raw, copy=False)
        message = kernel.session.deserialize(packed, content=True, copy=False)
        if (
            message["header"]["msg_type"] == "comm_msg"
            and message["content"].get("comm_id") == comm_id
        ):
            kernel.comm_manager.comm_msg(kernel.shell_stream, identities, message)
            return True
        return False

    def _pump_ipykernel6(self, kernel, comm_id):
        queue = getattr(getattr(kernel, "msg_queue", None), "_queue", None)
        if queue is None:
            return False
        handled = False
        for item in list(queue):
            _, dispatch, args = item
            if getattr(dispatch, "__self__", None) is not kernel or getattr(dispatch, "__name__", None) != "dispatch_shell":
                continue
            if SceneWidget._dispatch_own_message(self, kernel, args[0], comm_id):
                queue.remove(item)
                handled = True
        self.transport_diagnostic = "ipykernel-6-queue"
        return handled

    def _ipykernel7_stream(self, kernel):
        thread = getattr(kernel, "shell_channel_thread", None)
        manager = getattr(thread, "manager", None)
        if manager is None:
            return None
        try:
            subshell = manager.subshell_id_from_thread_id(threading.get_ident())
            pair = manager.get_shell_channel_to_subshell_pair(subshell)
        except (AttributeError, KeyError, RuntimeError):
            return None
        return getattr(pair, "to_stream", None)

    def _begin_comm_pump(self):
        """Temporarily own ipykernel 7's current-shell receive stream.

        ipykernel serializes shell messages behind an executing cell.  A live
        widget command awaited by that cell therefore has to dispatch only its
        own comm replies while leaving unrelated shell work queued normally.
        """
        try:
            from IPython import get_ipython

            kernel = getattr(get_ipython(), "kernel", None)
            comm_id = getattr(getattr(self, "comm", None), "comm_id", None)
            stream = self._ipykernel7_stream(kernel) if kernel else None
            if not kernel or not comm_id or stream is None:
                return None
            callback = getattr(stream, "_recv_callback", None)
            copy = getattr(stream, "_recv_copy", False)
            if callback is None:
                return None
            stream.stop_on_recv()
            self.transport_diagnostic = "ipykernel-7-shell-stream"
            return kernel, comm_id, stream, callback, copy
        except (AttributeError, RuntimeError, TypeError):
            return None

    def _pump_comm(self, adapter):
        try:
            from IPython import get_ipython

            kernel = getattr(get_ipython(), "kernel", None)
            comm_id = getattr(getattr(self, "comm", None), "comm_id", None)
            if not kernel or not comm_id:
                return False
            if adapter is None:
                return self._pump_ipykernel6(kernel, comm_id)
            kernel, comm_id, stream, callback, copy = adapter
            import zmq

            handled = False
            while True:
                try:
                    raw = stream.socket.recv_multipart(flags=zmq.NOBLOCK, copy=copy)
                except zmq.Again:
                    break
                if SceneWidget._dispatch_own_message(self, kernel, raw, comm_id):
                    handled = True
                else:
                    # Restore the kernel's normal dispatch path. Its shell lock
                    # keeps unrelated cells from executing until this cell exits.
                    callback(raw)
            return handled
        except (AttributeError, IndexError, ValueError, TypeError):
            return False

    def _end_comm_pump(self, adapter):
        if adapter is None:
            return
        _, _, stream, callback, copy = adapter
        stream.on_recv(callback, copy=copy)

    def _pump_own_comm_messages(self):
        """Deliver only this widget's queued Comm messages during an awaited cell.

        ipykernel 6 serializes shell requests, including Comm replies, behind the
        currently executing cell. An async cell awaiting a browser reply would
        otherwise wait for a message that the kernel cannot dispatch until that
        cell exits. Leave unrelated shell requests in their original queue.
        """
        try:
            from IPython import get_ipython

            kernel = getattr(get_ipython(), "kernel", None)
            comm_id = getattr(getattr(self, "comm", None), "comm_id", None)
            if not comm_id:
                return
            SceneWidget._pump_ipykernel6(self, kernel, comm_id)
        except (AttributeError, IndexError, ValueError, TypeError):
            # Other kernels process Comm messages through their normal loop.
            return

    async def await_response(self, awaitable, timeout=60, *, command=None, request=None, view=None, revision=None):
        task = asyncio.ensure_future(awaitable)
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        adapter = self._begin_comm_pump()
        try:
            while not task.done():
                self._pump_comm(adapter)
                if task.done():
                    break
                remaining = deadline - loop.time()
                if remaining <= 0:
                    phase = self.command_phases.get(request, "waiting for frontend response")
                    transport = self.transport_diagnostic or "unsupported notebook comm transport"
                    raise TimeoutError(
                        f"HMPlot {command or 'command'} timed out during {phase} "
                        f"(view={view!r}, revision={revision}, transport={transport})."
                    )
                await asyncio.sleep(min(0.01, remaining))
            return await task
        finally:
            self._end_comm_pump(adapter)
            if not task.done():
                task.cancel()

    def close(self):
        exporter.SNAPSHOTS.cancel(self)
        self.snapshot_views = {}
        for _, _, future in getattr(self, "waiters", []):
            future.get_loop().call_soon_threadsafe(
                self.scene._finish_future, future, None, RuntimeError("Scene closed.")
            )
        self.waiters = []
        self.waiting = None
        for c in [
            *getattr(self, "resources", {}).values(),
            *[c for _, c in getattr(self, "retired", [])],
        ]:
            c.close()
        self.resources = {}
        self.retired = []
        super().close()
