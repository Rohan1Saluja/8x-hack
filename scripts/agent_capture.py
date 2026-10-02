"""Manual browser-session recorder. No hooks, model calls, env reads or exports.

Input is an explicitly reviewed JSON object on stdin, NEVER a raw tool transcript.
The full session is supplied on append; existing entry bytes must remain identical.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
BOUNDARY = "\n---\n\n[LOG_ENTRY type=PROMPT num=1 "
MODELS = {"GPT-5.6 Sol", "GPT-6 ASTRA", "GPT-6.1 Sol"}
SECRET_PATTERNS = [
    r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----",
    r"\b(?:gsk_|ghp_|github_pat_|sk_live_|sk-proj-|sk-ant-)[A-Za-z0-9_-]{16,}",
    r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
    r"(?i)\bBearer\s+[A-Za-z0-9._~-]{12,}",
    r"(?i)\b(?:postgres(?:ql)?|https?)://[^\s/:]+:[^\s/@]+@",
    r"(?m)^\s*(?:export\s+)?[A-Z][A-Z0-9_]{2,}\s*=\s*\S+",
    r"(?i)[\"']?(?:api[_-]?key|secret|password|access[_-]?token|refresh[_-]?token)[\"']?\s*[:=]\s*[\"']?[^\s\"']{8,}",
]
TRACE_PATTERNS = [
    r"(?im)^\s*(?:<\|(?:im_start|im_end|start|end)\|>|<tool_call>|<think>)",
    r'(?im)^\s*"(?:tool_calls|tool_results|chain_of_thought|reasoning|analysis)"\s*:',
    r"(?im)^\s*(?:assistant\s+to=|diff --git |\*\*\* Begin Patch)",
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_text(value):
    require(isinstance(value, str) and bool(value.strip()), "Empty or non-text content")
    require(not any(ord(c) < 32 and c not in "\n\r\t" for c in value), "Control character")
    require(not re.search(r"(?m)^\[LOG_ENTRY type=(?:PROMPT|RESPONSE) num=\d+ session=[a-f0-9]{8}\]$", value), "Reserved log delimiter in content")
    for pattern in SECRET_PATTERNS + TRACE_PATTERNS:
        require(not re.search(pattern, value), "Possible secret, environment assignment or trace; publication blocked")


def utc(value):
    require(isinstance(value, str) and bool(re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z", value)), "Expected UTC ISO timestamp ending Z")
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def render(payload):
    require(isinstance(payload, dict) and set(payload) == {"session_id", "exchanges"}, "Unexpected session fields")
    sid = payload["session_id"]
    require(isinstance(sid, str) and str(uuid.UUID(sid)) == sid, "Expected canonical UUID")
    exchanges = payload["exchanges"]
    require(isinstance(exchanges, list) and bool(exchanges), "A complete real exchange is required")
    models = []
    previous = None
    entries = []
    short = sid[:8]
    fields = {"prompt", "response", "prompt_time", "response_time", "model"}
    for i, item in enumerate(exchanges, 1):
        require(isinstance(item, dict) and set(item) == fields, "Unexpected exchange fields")
        require(item["model"] in MODELS, "Model must be a confirmed project model; never infer it from role")
        ptime, rtime = utc(item["prompt_time"]), utc(item["response_time"])
        require(ptime <= rtime <= dt.datetime.now(dt.timezone.utc), "Invalid or future event time")
        require(previous is None or previous <= ptime, "Nonchronological exchanges")
        previous = rtime
        if item["model"] not in models:
            models.append(item["model"])
        for kind, field, time_field in [("PROMPT", "prompt", "prompt_time"), ("RESPONSE", "response", "response_time")]:
            safe_text(item[field])
            entries.append(f"[LOG_ENTRY type={kind} num={i} session={short}]\n"
                           f"timestamp: {item[time_field]}\nmodel: {item['model']}\n\n{item[field]}")
    first, last = exchanges[0]["prompt_time"], exchanges[-1]["prompt_time"]
    date = first[:10]
    model_header = models[0] if len(models) == 1 else "mixed (see entries)"
    header = (f"---\nsession_id: {sid}\ndate: {date}\nauthor: Rohan1Saluja\n"
              f"model: {model_header}\ntool: chatgpt-browser\nproject: 8x-hack\n"
              f"total_exchanges: {len(exchanges)}\nfirst_prompt_time: {first}\nlast_prompt_time: {last}\n---\n\n"
              f"# Session Log - {date}\n\nSession: `{short}` | Project: `8x-hack` | Author: `Rohan1Saluja`\n\n---\n\n")
    name = utc(first).strftime("%Y-%m-%d_%H-%M-%S_") + sid + ".md"
    return name, header + "\n\n".join(entries) + "\n"


def parse(raw):
    """Strict round-trip parser: whitespace inside each prompt/response is preserved."""
    require(raw.startswith("---\n"), "Missing session frontmatter")
    front, body = raw[4:].split("\n---\n", 1)
    metadata = dict(line.split(": ", 1) for line in front.splitlines())
    pattern = re.compile(r"(?m)^\[LOG_ENTRY type=(PROMPT|RESPONSE) num=(\d+) session=([a-f0-9]{8})\]\n"
                         r"timestamp: ([^\n]+)\nmodel: ([^\n]+)\n\n")
    matches = list(pattern.finditer(body))
    require(len(matches) >= 2 and len(matches) % 2 == 0, "Incomplete exchange")
    exchanges = []
    for i in range(0, len(matches), 2):
        p, r = matches[i:i+2]
        require(p[1] == "PROMPT" and r[1] == "RESPONSE" and p[2] == r[2] == str(i // 2 + 1), "Invalid exchange numbering")
        require(p[5] == r[5], "Exchange model mismatch")
        prompt = body[p.end():r.start()]
        end = matches[i+2].start() if i+2 < len(matches) else len(body)
        response = body[r.end():end]
        require(prompt.endswith("\n\n"), "Invalid prompt separator")
        suffix = "\n\n" if i+2 < len(matches) else "\n"
        require(response.endswith(suffix), "Invalid response separator")
        exchanges.append(dict(prompt=prompt[:-2], response=response[:-len(suffix)],
                              prompt_time=p[4], response_time=r[4], model=p[5]))
    payload = {"session_id": metadata["session_id"], "exchanges": exchanges}
    name, canonical = render(payload)
    require(canonical == raw, "Noncanonical or modified log structure")
    return name, payload


def unchanged_entries(old, new):
    old_name, old_payload = parse(old)
    new_name, new_payload = parse(new)
    require(old_name == new_name, "Session identity changed")
    previous = old_payload["exchanges"]
    require(new_payload["exchanges"][:len(previous)] == previous, "Existing entries cannot be edited or removed")
    require(new.split(BOUNDARY, 1)[1].startswith(old.split(BOUNDARY, 1)[1]), "Existing entry bytes changed")


def record(payload, root=ROOT):
    name, content = render(payload)
    directory = root / ".agent-logs"
    require(not directory.is_symlink(), "Log directory cannot be a symlink")
    directory.mkdir(exist_ok=True)
    path = directory / name
    require(not path.is_symlink(), "Log file cannot be a symlink")
    # Exclusive lock prevents competing local writers; remote writes need GitHub SHA checks.
    lock = directory / ".capture.lock"
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    temp = None
    try:
        os.close(fd)
        for other in directory.glob(f"*_{payload['session_id']}.md"):
            require(other == path, "Session UUID already exists with a different start time")
        if path.exists():
            old = path.read_bytes().decode("utf-8")
            unchanged_entries(old, content)
            if old == content:
                return path
        with tempfile.NamedTemporaryFile(dir=root, prefix=".capture-", delete=False) as out:
            temp = Path(out.name)
            out.write(content.encode("utf-8"))
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, path)
        return path
    finally:
        if temp is not None and temp.exists():
            temp.unlink()
        lock.unlink()


def git(*args, root=ROOT):
    return subprocess.check_output(["git", *args], cwd=root)


def check(root=ROOT, base=None):
    directory = root / ".agent-logs"
    require(directory.is_dir() and not directory.is_symlink(), "Missing or unsafe log directory")
    sessions = set()
    for path in directory.iterdir():
        require(path.name == "README.md" or path.suffix == ".md", "Unexpected file in log directory")
        require(path.is_file() and not path.is_symlink(), "Unsafe log path")
        if path.name == "README.md":
            continue
        name, payload = parse(path.read_bytes().decode("utf-8"))
        require(name == path.name and payload["session_id"] not in sessions, "Invalid filename or duplicate session UUID")
        sessions.add(payload["session_id"])
    probe = ".agent-logs/2000-01-01_00-00-00_00000000-0000-4000-8000-000000000000.md"
    paths = [probe] + [str(p.relative_to(root)) for p in directory.iterdir()]
    result = subprocess.run(["git", "check-ignore", "--no-index", "--stdin"],
                            input="\n".join(paths).encode(), cwd=root, capture_output=True)
    require(result.returncode == 1, "Agent logs are ignored or ignore check failed")
    if base:
        names = git("ls-tree", "-r", "--name-only", base, "--", ".agent-logs", root=root).decode().splitlines()
        for name in names:
            if name.endswith(".md") and name != ".agent-logs/README.md":
                target = root / name
                require(target.is_file(), "A committed session log was removed")
                unchanged_entries(git("show", f"{base}:{name}", root=root).decode(), target.read_bytes().decode())
    return len(sessions)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    writer = sub.add_parser("record")
    writer.add_argument("--reviewed-public-text", action="store_true", required=True,
                        help="Attest input contains only reviewed user/final text and confirmed metadata")
    checker = sub.add_parser("check")
    checker.add_argument("--base", help="Git commit/ref against which existing entries must be preserved")
    args = parser.parse_args()
    try:
        if args.command == "record":
            path = record(json.load(sys.stdin))
            print(path.relative_to(ROOT))
        else:
            print(f"PASS: {check(base=args.base)} session log(s); canaries require separate real-session evidence")
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError):
        # Never echo rejected payloads, credentials, parser excerpts or tool output.
        print("Capture rejected: invalid, unsafe, conflicting or modified input. No payload printed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
