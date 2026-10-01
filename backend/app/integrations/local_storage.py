"""Development-only filesystem recording storage; never mounted as a public directory."""

import os
import secrets
import time
from pathlib import PurePosixPath
from urllib.parse import urlsplit

import jwt

from app.config import settings
from app.errors import fail

MAX_BYTES = 24_000_000


def require_local():
    config = settings()
    if (
        config.recording_storage != "local"
        or config.app_env != "development"
        or os.getenv("VERCEL")
    ):
        fail(503, "local_storage_disabled", "Local recording storage is development-only.")


def root():
    require_local()
    folder = settings().local_recordings_dir.resolve()
    try:
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    except OSError:
        fail(503, "storage_unavailable", "Cannot create the local recording directory.")
    return folder


def recording_path(key: str, *, must_exist=True):
    folder = root()
    if (
        not isinstance(key, str)
        or not key
        or "\\" in key
        or "\x00" in key
        or PurePosixPath(key).is_absolute()
        or any(part in ("", ".", "..") for part in key.split("/"))
    ):
        fail(404, "recording_not_found", "Recording not found.")
    path = (folder / key).resolve()
    if not path.is_relative_to(folder) or path == folder:
        fail(404, "recording_not_found", "Recording not found.")
    if must_exist and not path.is_file():
        fail(404, "recording_not_found", "Recording not found.")
    if must_exist and not 0 < path.stat().st_size <= MAX_BYTES:
        fail(422, "recording_limit", "Use a recording under 24 MB.")
    return path


def write_recording(key: str, content: bytes):
    if not 0 < len(content) <= MAX_BYTES:
        fail(422, "recording_limit", "Use a recording under 24 MB.")
    path = recording_path(key, must_exist=False)
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with path.open("xb") as output:
            output.write(content)
    except FileExistsError:
        fail(409, "recording_exists", "This recording already exists.")
    except OSError:
        path.unlink(missing_ok=True)
        fail(503, "storage_unavailable", "Cannot save the local recording.")


def delete_recording(key: str):
    path = recording_path(key, must_exist=False)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        fail(503, "storage_unavailable", "Cannot delete the local recording.", True)


# Development runs one backend worker. Restarting it invalidates playback links;
# the existing authenticated playback endpoint can issue a new link.
_signing_key = secrets.token_bytes(32)
_audience = "eightx-local-recording"


def local_playback_url(key: str):
    recording_path(key)
    config = settings()
    base = config.local_storage_base_url.rstrip("/")
    parsed = urlsplit(base)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        fail(503, "invalid_local_storage_url", "Use the local backend HTTP origin for playback.")
    token = jwt.encode(
        {"key": key, "aud": _audience, "exp": int(time.time()) + config.playback_url_seconds},
        _signing_key,
        algorithm="HS256",
    )
    return {"url": f"{base}/local-recordings/{token}", "expires_in": config.playback_url_seconds}


def playback_file(token: str):
    require_local()
    try:
        claims = jwt.decode(
            token,
            _signing_key,
            algorithms=["HS256"],
            audience=_audience,
            options={"require": ["exp", "aud", "key"]},
        )
    except jwt.InvalidTokenError:
        fail(403, "invalid_playback_link", "Playback link expired or invalid. Refresh playback.")
    return recording_path(claims["key"])
