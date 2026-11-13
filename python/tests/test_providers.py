# TODO 20.2: hm.Provider, data loaded in the browser from a URL with params.
import asyncio
import json

import numpy as np
import pytest

import hmplot as hm


def node(state, kind):
    found = []

    def visit(n):
        if n["kind"] == kind:
            found.append(n)
        for child in n["children"]:
            visit(child)

    visit(state["root"])
    return found


def test_a_provider_is_a_data_container_with_a_url_and_params():
    with hm.Scene() as scene:
        with hm.Provider(url="/api/penguins?species={species}", params={"species": "Adelie", "n": np.int64(3)},
                         key="id", refresh_interval=30_000, format="json", path="rows") as penguins:
            with hm.Plot():
                hm.Points(x="bill_length", y="bill_depth")
    state, _ = scene._snapshot()
    [provider] = node(state, "Provider")
    assert provider["id"] == penguins.id
    assert provider["props"] == {
        "url": "/api/penguins?species={species}", "params": {"species": "Adelie", "n": 3}, "key": "id",
        "refreshInterval": 30000, "format": "json", "path": "rows",
    }
    assert type(provider["props"]["params"]["n"]) is int
    assert [child["kind"] for child in provider["children"]] == ["Plot"]
    json.dumps(state)


def test_an_accumulating_provider_sends_its_options_and_a_version_cursor():
    # TODO 127: accumulate=True or {"max_rows": N}; a url's {version} is the cursor, not a param.
    with hm.Scene() as scene:
        with hm.Provider(url="/events?since={version}", key="id", refresh_interval=5000,
                         accumulate={"max_rows": 500}):
            with hm.Plot():
                hm.Points(x="t", y="value")
    [provider] = node(scene._snapshot()[0], "Provider")
    assert provider["props"]["accumulate"] == {"maxRows": 500}
    assert hm.Provider(url="/events", accumulate=True).props["accumulate"] is True
    with pytest.raises(ValueError, match="unknown key 'max_row'"):
        hm.Provider(url="/events", accumulate={"max_row": 5})


def test_assigning_params_publishes_them_and_the_getter_returns_a_copy():
    with hm.Scene() as scene:
        penguins = hm.Provider(url="/data/{species}.json", params={"species": "Adelie"})
    revision = scene.revision
    penguins.params = {"species": "Gentoo"}
    assert scene.revision == revision + 1
    assert node(scene._snapshot()[0], "Provider")[0]["props"]["params"] == {"species": "Gentoo"}
    copy = penguins.params
    copy["species"] = "Chinstrap"
    assert penguins.params == {"species": "Gentoo"}


def test_params_must_be_plain_values_and_a_url_is_required():
    with pytest.raises(TypeError, match="requires url"):
        hm.Provider(params={"a": 1})
    with pytest.raises(TypeError, match=r"params\['when'\] is a datetime"):
        import datetime
        hm.Provider(url="/x", params={"when": datetime.datetime.now()})
    with pytest.raises(TypeError, match="must be a dict"):
        hm.Provider(url="/x", params=[1, 2])
    provider = hm.Provider(url="/x", params={"ids": (1, 2), "nested": {"on": True, "none": None}})
    assert provider.props["params"] == {"ids": [1, 2], "nested": {"on": True, "none": None}}


def test_initial_becomes_a_table_with_the_providers_key():
    with hm.Scene() as scene:
        hm.Provider(url="/x", initial={"id": ["a", "b"], "x": [1.0, 2.0]}, key="id")
    state, _ = scene._snapshot()
    [provider] = node(state, "Provider")
    table = provider["props"]["initial"]["$table"]
    assert state["tables"][table]["key"] == "id"
    assert set(state["tables"][table]["columns"]) == {"id", "x"}


def test_load_and_error_events_are_provider_events():
    received = []
    with hm.Scene() as scene:
        provider = hm.Provider(url="/x")
        plot = hm.Plot()
    provider.on_event("load", lambda event: received.append(("load", event.load_revision, event.rows, event.target)))
    provider.on_event("error", lambda event: received.append(("error", event.message)))
    with pytest.raises(ValueError):
        plot.on_event("load", lambda event: None)
    state, _ = scene._snapshot()
    assert node(state, "Provider")[0]["events"] == ["load", "error"]
    scene._views["test"] = {"ready": True}
    scene._receive({"type": "event", "scene": scene.id, "view": "test", "target": provider.id, "event": "load",
                    "revision": scene.revision, "payload": {"load_revision": 2, "rows": 344, "ms": 12.5}}, [])
    scene._receive({"type": "event", "scene": scene.id, "view": "test", "target": provider.id, "event": "error",
                    "revision": scene.revision, "payload": {"load_revision": 3, "message": "HTTP 404 Not Found: /x"}}, [])
    assert received == [("load", 2, 344, provider), ("error", "HTTP 404 Not Found: /x")]


@pytest.mark.asyncio
async def test_refresh_is_the_refresh_action():
    with hm.Scene() as scene:
        provider = hm.Provider(url="/x")
    scene._views["test"] = {"ready": True}
    sent = []

    class Transport:
        def send(self, message):
            sent.append(message)
            scene._receive({"type": "result", "scene": scene.id, "request": message["request"], "value": None}, [])

    scene._widget = Transport()
    assert await asyncio.wait_for(provider.refresh(), 1) is None
    assert (sent[-1]["command"], sent[-1]["target"], sent[-1]["args"]["action"]) == ("action", provider.id, "refresh")


def test_browserless_html_export_keeps_snapshot_providers_live_and_says_so():
    with hm.Scene() as scene:
        with hm.Provider(url="/data/{species}.json", params={"species": "Adelie"}) as live:
            with hm.Plot():
                hm.Points(x="x", y="y")
        with hm.Provider(url="/data/other.json", snapshot=False):
            with hm.Plot():
                hm.Points(x="x", y="y")
    with pytest.warns(RuntimeWarning, match=f"Provider {live.id} will load when the page opens"):
        html = hm.export_html(scene, snapshot=False).decode("utf-8")
    assert "/data/{species}.json" in html and "/data/other.json" in html
    with hm.ExportSession() as session:
        with pytest.warns(RuntimeWarning):
            session.html(scene, snapshot=False)
        assert session.last_report["live_providers"] == [live.id]
