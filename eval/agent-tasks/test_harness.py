"""Small invariants for the agent-task eval; browser/PDF paths use the reference programs."""

import json
import tempfile
import unittest
from pathlib import Path

from agenteval.data import DATASETS, place
from agenteval.libraries import LIBRARIES
from agenteval.prompt import make_prompt
from agenteval.tasks import PILOT_TASKS, TASKS
from run import audit_dir, cli, report, snapshot_round


class HarnessTests(unittest.TestCase):
    def test_correction_omits_embedded_data_but_keeps_the_error(self):
        from agenteval.prompt import correction_prompt
        result = {"checks": [{"name": "HMPlot artifact", "status": "fail",
                              "detail": 'Parquet data:application/octet-stream;base64,' + 'A'*500000 + ' could not be read: missing content-length'}]}
        prompt = correction_prompt(result, 'javascript')
        self.assertLess(len(prompt), 1000)
        self.assertIn('missing content-length', prompt)
        self.assertIn('embedded data URL omitted', prompt)
        self.assertGreater(len(result['checks'][0]['detail']), 500000)

    def test_correction_lists_hmplot_lints_and_warnings_without_failing(self):
        from agenteval.checks import advisories
        from agenteval.prompt import correction_prompt
        report = {"ready": True, "errors": [], "warnings": [{"message": "Points drew no rows"}],
                  "lints": [{"code": "lint.color-unexplained", "message": "Points: fill maps species and no legend explains it"}]}
        lines = advisories(report)
        self.assertEqual(lines, ["warning: Points drew no rows",
                                 "lint: Points: fill maps species and no legend explains it"])
        result = {"checks": [{"name": "interaction brush", "status": "unknown", "detail": "requires review"}],
                  "metrics": {"hmplot_advisories": lines}}
        prompt = correction_prompt(result, "javascript")
        self.assertIn("also noted (not failures)", prompt)
        self.assertIn("drew no rows", prompt)
        self.assertNotIn("drew no rows", correction_prompt({"checks": result["checks"]}, "javascript"))

    def test_native_rows_use_completed_renderer_summaries(self):
        from agenteval.checks import _native_observed_rows

        report = {"ready": True, "plots": [{"model": {"marks": [{"rows": 342}, {"rows": None}]}}]}
        self.assertEqual(_native_observed_rows(report), 342)
        self.assertEqual(_native_observed_rows({**report, "ready": False}), 0)
        self.assertEqual(_native_observed_rows(None), 0)

    def test_hmplot_condition_rejects_a_custom_page_and_an_unused_empty_plot(self):
        from agenteval.checks import _hmplot_artifact_check, _hmplot_marks_check

        self.assertEqual(_hmplot_artifact_check({"visible": True, "chartCount": 1})["status"], "fail")
        self.assertEqual(_hmplot_artifact_check({"hmplotRuntime": True, "hmplotLiveCanvases": 0})["status"], "fail")
        self.assertEqual(_hmplot_artifact_check({"hmplotRuntime": True, "hmplotLiveCanvases": 1})["status"], "pass")
        self.assertEqual(_hmplot_marks_check([{"model": {"marks": []}}])["status"], "fail")
        self.assertEqual(_hmplot_marks_check([{"model": {"marks": [{"kind": "Line", "rows": 12}]}}])["status"], "pass")

    def test_d3_hard_data_is_reproducible_and_has_complete_unique_keys(self):
        import pandas as pd
        from agenteval.data import channel_traffic, portfolio

        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder) / "a", Path(folder) / "b"
            a.mkdir(); b.mkdir()
            for generate, filename in ((portfolio, "portfolio.csv"), (channel_traffic, "channel_traffic.csv")):
                generate(a); generate(b)
                self.assertEqual((a / filename).read_bytes(), (b / filename).read_bytes())
            leaves = pd.read_csv(a / "portfolio.csv")
            self.assertEqual(len(leaves), 360)
            self.assertTrue(leaves["product"].is_unique)
            self.assertTrue((leaves[["revenue_k", "orders"]] > 0).all().all())
            traffic = pd.read_csv(a / "channel_traffic.csv")
            self.assertEqual(traffic["date"].nunique(), 1096)
            self.assertEqual(set(traffic.groupby("date").size()), {18})
            self.assertFalse(traffic.duplicated(["date", "channel"]).any())
            self.assertTrue((traffic["sessions"] > 0).all())

    def test_disappearing_chart_does_not_certify_brushing_or_animation(self):
        from PIL import Image
        from agenteval.checks import _difference, _interaction_check
        with tempfile.TemporaryDirectory() as folder:
            before, after = Path(folder) / "before.png", Path(folder) / "after.png"
            Image.new("RGB", (100, 100), "blue").save(before)
            Image.new("RGB", (100, 100), "white").save(after)
            delta = _difference(before, after)
            self.assertGreater(delta, .002)
            for action in ("brush", "animate"):
                check = _interaction_check(action, delta)
                self.assertEqual(check["status"], "unknown")
                self.assertIn("requires review", check["detail"])

    def test_catalog_covers_every_planned_category_with_unique_ids_and_data(self):
        ids = [task["id"] for task in TASKS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(ids), 20)
        self.assertGreaterEqual(len(ids), 60)
        self.assertEqual({"basic", "statistical", "layout and annotation", "interaction", "scale",
                          "animation and simulation", "maps and 3D", "export"},
                         {task["category"] for task in TASKS})
        self.assertTrue(all(set(task["data"]) <= DATASETS.keys() for task in TASKS))
        self.assertEqual([task["category"] for task in TASKS if task["id"] in PILOT_TASKS],
                         ["basic", "interaction", "scale"])
        # Stage 131: ordinary charts, not written for HMPlot's strengths, are a large share.
        self.assertGreaterEqual(sum(task["source"] == "general" for task in TASKS), 30)

    def test_task_text_is_identical_in_all_library_conditions(self):
        task = TASKS[0]
        for library in LIBRARIES:
            self.assertIn("Task: " + task["prompt"], make_prompt(task, library))
            output = "solution.svelte" if LIBRARIES[library].get("track") == "javascript" else "solution.py"
            self.assertIn(output, make_prompt(task, library))

    def test_cli_grants_only_file_tools_and_caps_session(self):
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder) / "run"
            run.mkdir()
            command = cli("claude", run, "claude-sonnet-5", .25, 8, "task")
            self.assertIn("--restricted", command)
            self.assertIn("--safe-mode", command)
            self.assertIn("--strict-mcp-config", command)
            self.assertEqual(command[command.index("--tools") + 1], "Read,Write,Edit,Grep,Glob")
            self.assertNotIn("--dangerously-skip-permissions", command)
            self.assertEqual(command[command.index("--max-turns") + 1], "8")
            settings = json.loads((Path(folder) / ".agent-config-run" / "settings.json").read_text())
            self.assertIn("Bash", settings["permissions"]["deny"])

    def test_each_run_gets_a_private_copy_of_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            files = place(["penguins"], root / "cache", root / "run")
            self.assertEqual(files, ["data/penguins.csv"])
            source = root / "cache" / "penguins" / "penguins.csv"
            target = root / "run" / "data" / "penguins.csv"
            self.assertNotEqual(source.stat().st_ino, target.stat().st_ino)
            self.assertEqual(source.read_bytes(), target.read_bytes())

    def test_program_sandbox_allows_metadata_of_a_root_under_home(self):
        # 2026-10-22: a root under the home directory (not /private/tmp) left python's realpath of
        # the venv denied, because the profile denied $HOME and re-allowed only the root downward.
        from agenteval.checks import _sandbox_command
        with tempfile.TemporaryDirectory(dir=Path.home()) as folder:
            root = Path(folder) / "nested" / "root"
            run = root / "runs" / "task" / "lib--agent" / "1"
            run.mkdir(parents=True)
            python = root / "venvs" / "hmplot" / "bin" / "python"
            command = _sandbox_command(run, python, Path(folder) / "tmp", [str(python), "-c", "pass"])
            profile = Path(command[2]).read_text()
            for ancestor in (Path(folder), Path(folder) / "nested", root, root / "venvs"):
                self.assertIn(f'(allow file-read* (literal "{ancestor}"))', profile)
            self.assertIn(f'(deny file-read* (subpath "{Path.home()}"))', profile)
            self.assertNotIn(f'(allow file-read* (subpath "{Path(folder)}"))', profile)

    def test_empty_report_has_headers(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(report(root), [])
            self.assertIn("task,library,index", (root / "results.csv").read_text())
            self.assertIn("Agent-task eval", (root / "report.html").read_text())

    def test_report_shows_agent_prompt_rounds_and_final_result(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            run = root / "runs" / "scatter" / "hmplot" / "1"
            run.mkdir(parents=True)
            audit = audit_dir(run)
            audit.mkdir()
            (run / "output").mkdir()
            (run / "output" / "chart.html").write_text("<html>chart</html>")
            (run / "task.txt").write_text("Agent-edited task text")
            (audit / "task-prompt.txt").write_text("Task: plot x < y")
            (audit / "prompt-0.txt").write_text("Task: plot x < y")
            (audit / "prompt-1.txt").write_text("Correct the missing legend")
            for number, code, status in ((0, "print('first')", "fail"), (1, "print('final')", "pass")):
                (run / "solution.py").write_text(code)
                (run / "screenshot.png").write_bytes(b"image")
                (run / "after.png").write_bytes(b"after")
                evaluation = {"checks": [{"name": "legend", "status": status, "detail": "species"}],
                              "metrics": {"lines_of_code": 1}}
                snapshot_round(run, audit, number, evaluation)
                (audit / f"round-{number}.json").write_text(json.dumps(evaluation))
            result = {"kind": "agent", "task": "scatter", "library": "hmplot", "index": 1,
                      "agent": "Claude Code", "agent_version": "2.1.281", "model": "claude-sonnet-5",
                      "sessions": [{"tokens": 7, "token_usage": {"input_tokens": 5, "output_tokens": 2},
                                    "wall_seconds": 1.0, "exit": 0},
                                   {"tokens": 11, "token_usage": {"input_tokens": 8, "output_tokens": 3},
                                    "wall_seconds": 2.0, "exit": 0}],
                      "checks": [{"name": "legend", "status": "pass", "detail": "species"}],
                      "metrics": {"lines_of_code": 1}, "first_try": False, "success": True, "review": "pass"}
            (run / "result.json").write_text(json.dumps(result))
            rows = report(root)
            page = (root / "report.html").read_text()
            self.assertEqual(rows[0]["tokens"], 18)
            self.assertEqual(rows[0]["model"], "claude-sonnet-5")
            self.assertNotIn("Agent-edited task text", page)
            for expected in ("Task: plot x &lt; y", "Claude Code", "2.1.281", "Correct the missing legend",
                             "round-0-screenshot.png", "round-0-after.png", "round-1-screenshot.png",
                             "round-1-after.png", "print(&#x27;first&#x27;)", "print(&#x27;final&#x27;)",
                             "Final result", "Final program", "chart.html", "First attempt", "Correction 1",
                             "Search tasks", "Replication", "Dataset provenance"):
                self.assertIn(expected, page)


if __name__ == "__main__":
    unittest.main()
