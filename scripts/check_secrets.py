"""Check file exclusion and common accidental credentials without printing their values."""
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
problems = []
patterns = [re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
            re.compile(rb"(?:gsk_|ghp_|sk_live_)[A-Za-z0-9]{20,}")]
for name in filter(None, tracked):
    path = root / name
    if path.name == ".env" or path.name.startswith(".env."):
        problems.append(f"Tracked environment file: {name}")
    if path.is_file() and any(p.search(path.read_bytes()) for p in patterns):
        problems.append(f"Possible credential in: {name}")
for name in ["frontend/.env.local", "backend/.env.local", "frontend/.env.example", "backend/.env.production"]:
    result = subprocess.run(["git", "check-ignore", "-q", name], cwd=root)
    if result.returncode:
        problems.append(f"Missing ignore rule for: {name}")
for path in (root / "frontend/.next").rglob("*"):
    if path.is_file() and (path.name == ".env" or path.name.startswith(".env.")):
        problems.append("Environment file in build output")
    if path.name.endswith(".nft.json") and re.search(r'"[^"\n]*(?:/|^)\.env(?:\.[^"/]*)?"', path.read_text()):
        problems.append("Environment file in build trace")
if problems:
    raise SystemExit("\n".join(problems))
print("PASS: environment paths ignored; no tracked credential patterns or bundled environment files")
