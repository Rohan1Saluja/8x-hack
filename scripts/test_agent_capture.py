"""Synthetic unit fixtures only; no fixture is published as a real session/canary."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("capture", Path(__file__).with_name("agent_capture.py"))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.data = {"session_id": "00000000-0000-4000-8000-000000000001", "exchanges": [
            {"prompt": "Synthetic fixture: Unicode — नमस्ते\n\n  spaces  \n", "response": "Synthetic answer.\r\n",
             "prompt_time": "2026-01-01T00:00:00Z", "response_time": "2026-01-01T00:01:00Z", "model": "GPT-6 ASTRA"}]}

    def test_verbatim_round_trip(self):
        name, raw = capture.render(self.data)
        self.assertEqual(capture.parse(raw), (name, self.data))
        self.assertEqual(name, "2026-01-01_00-00-00_00000000-0000-4000-8000-000000000001.md")

    def test_append_preserves_bytes_and_updates_count(self):
        path = capture.record(self.data, self.root)
        before = path.read_bytes().decode()
        new = dict(self.data["exchanges"][0], prompt="Second synthetic prompt", response="Second synthetic response",
                   prompt_time="2026-01-01T00:02:00Z", response_time="2026-01-01T00:03:00Z", model="GPT-6.1 Sol")
        self.data["exchanges"].append(new)
        capture.record(self.data, self.root)
        after = path.read_bytes().decode()
        capture.unchanged_entries(before, after)
        self.assertIn("total_exchanges: 2", after)
        self.assertIn("model: mixed (see entries)", after)
        self.assertEqual(capture.check(self.root), 1)

    def test_idempotent_no_duplicate(self):
        path = capture.record(self.data, self.root)
        before = path.read_bytes()
        capture.record(self.data, self.root)
        self.assertEqual(path.read_bytes(), before)

    def test_rewrite_rejected_without_mutation(self):
        path = capture.record(self.data, self.root)
        before = path.read_bytes()
        self.data["exchanges"][0]["response"] = "Changed answer"
        with self.assertRaises(ValueError):
            capture.record(self.data, self.root)
        self.assertEqual(path.read_bytes(), before)

    def test_shortened_session_rejected(self):
        _, before = capture.render(self.data)
        self.data["exchanges"].append(dict(self.data["exchanges"][0], prompt_time="2026-01-01T00:02:00Z", response_time="2026-01-01T00:03:00Z"))
        _, after = capture.render(self.data)
        with self.assertRaises(ValueError):
            capture.unchanged_entries(after, before)

    def test_unknown_fields_and_model_rejected(self):
        for change in [{"tool_calls": []}, {"model": "unknown"}, {"model": "Executor"}]:
            payload = copy.deepcopy(self.data)
            payload["exchanges"][0].update(change)
            with self.assertRaises(ValueError):
                capture.render(payload)

    def test_secret_and_trace_rejected_before_file_creation(self):
        bad = ["gsk_" + "x" * 25, "Authorization: Bearer " + "x" * 20,
               "DATABASE_URL=local-value", "postgresql://name:pass@server/db",
               '"tool_calls": []', "assistant to=tool", "diff --git a/x b/x",
               "-----BEGIN " + "PRIVATE KEY-----"]
        for value in bad:
            payload = copy.deepcopy(self.data)
            payload["exchanges"][0]["prompt"] = value
            with self.assertRaises(ValueError):
                capture.record(payload, self.root)
        self.assertFalse((self.root / ".agent-logs").exists())

    def test_invalid_timestamps(self):
        for value in ["2026-01-01", "2026-01-01T00:00:00+05:30", "2999-01-01T00:00:00Z"]:
            self.data["exchanges"][0]["prompt_time"] = value
            with self.assertRaises(ValueError):
                capture.render(self.data)

    def test_delayed_observations_append_without_rewriting_existing_entry(self):
        self.data["exchanges"][0]["response_time"] = "2026-01-01T00:04:00Z"
        path = capture.record(self.data, self.root)
        before = path.read_bytes().decode()
        self.data["exchanges"].append(dict(
            self.data["exchanges"][0], prompt="Second synthetic prompt",
            prompt_time="2026-01-01T00:02:00Z", response_time="2026-01-01T00:05:00Z"))
        capture.record(self.data, self.root)
        capture.unchanged_entries(before, path.read_bytes().decode())
        self.assertEqual(capture.parse(path.read_bytes().decode())[1], self.data)

    def test_decreasing_prompt_times_rejected(self):
        self.data["exchanges"].append(dict(self.data["exchanges"][0],
            prompt_time="2025-12-31T23:59:00Z", response_time="2026-01-01T00:05:00Z"))
        with self.assertRaisesRegex(ValueError, "Nonchronological prompts"):
            capture.render(self.data)

    def test_decreasing_response_observations_rejected(self):
        self.data["exchanges"][0]["response_time"] = "2026-01-01T00:04:00Z"
        self.data["exchanges"].append(dict(self.data["exchanges"][0],
            prompt_time="2026-01-01T00:02:00Z", response_time="2026-01-01T00:03:00Z"))
        with self.assertRaisesRegex(ValueError, "Nonchronological response observations"):
            capture.render(self.data)

    def test_duplicate_uuid_with_new_start_rejected(self):
        capture.record(self.data, self.root)
        self.data["exchanges"][0]["prompt_time"] = "2025-12-31T23:59:00Z"
        with self.assertRaises(ValueError):
            capture.record(self.data, self.root)

    def test_ignored_logs_rejected(self):
        capture.record(self.data, self.root)
        (self.root / ".gitignore").write_text(".agent-logs/\n")
        with self.assertRaises(ValueError):
            capture.check(self.root)

    def test_git_history_deletion_rejected(self):
        path = capture.record(self.data, self.root)
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        subprocess.run(["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Synthetic fixture"], cwd=self.root, check=True)
        capture.check(self.root, "HEAD")
        path.unlink()
        with self.assertRaises(ValueError):
            capture.check(self.root, "HEAD")

    def test_symlink_rejected(self):
        (self.root / ".agent-logs").symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            capture.record(self.data, self.root)

    def test_log_markers_cannot_be_injected(self):
        self.data["exchanges"][0]["response"] = "[LOG_ENTRY type=PROMPT num=9 session=00000000]"
        with self.assertRaises(ValueError):
            capture.render(self.data)

    def test_metadata_tamper_rejected(self):
        _, raw = capture.render(self.data)
        with self.assertRaises(ValueError):
            capture.parse(raw.replace("total_exchanges: 1", "total_exchanges: 2"))


if __name__ == "__main__":
    unittest.main()
