"""One private Vercel Blob store for development and production recordings."""

import os
import re
from contextlib import contextmanager
from pathlib import PurePosixPath
from uuid import UUID, uuid4

from vercel.blob import BlobClient, BlobNotFoundError

from app.config import settings
from app.errors import AppError, fail

MAX_BYTES = 24_000_000
RECORDING_KEY = re.compile(
    r"^(development|production)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(wav|mp3|mp4|m4a|webm)$"
)


def prefix():
    return (
        "production" if settings().app_env == "production" or os.getenv("VERCEL") else "development"
    )


def validate_key(key: str):
    if not RECORDING_KEY.fullmatch(key):
        fail(409, "invalid_recording", "This meeting needs a recording uploaded to Vercel Blob.")


@contextmanager
def blob_client():
    token = settings().blob_read_write_token.get_secret_value()
    if not token:
        fail(
            503,
            "storage_not_configured",
            "Configure BLOB_READ_WRITE_TOKEN for a private Blob store.",
        )
    try:
        with BlobClient(token=token) as client:
            yield client
    except AppError:
        raise
    except BlobNotFoundError:
        fail(404, "recording_not_found", "Recording not found in Vercel Blob.")
    except Exception:
        # SDK errors may include request details. Keep them out of API responses.
        fail(
            502,
            "storage_unavailable",
            "Vercel Blob is unavailable. Check storage configuration.",
            True,
        )


def upload_recording(meeting_id: UUID, content: bytes):
    if not 0 < len(content) <= MAX_BYTES:
        fail(422, "recording_limit", "Use a recording under 24 MB.")
    key = f"{prefix()}/{meeting_id}/{uuid4()}.wav"
    with blob_client() as client:
        result = client.put(
            key,
            content,
            access="private",
            content_type="audio/wav",
            overwrite=False,
            add_random_suffix=False,
        )
        if result.pathname != key:
            fail(
                502,
                "invalid_storage_response",
                "Vercel Blob returned an unexpected recording path.",
            )
    return key


def playback_descriptor(key: str):
    validate_key(key)
    # Next.js signs this owner-checked path; Blob serves media to the browser.
    return {"pathname": key, "expires_in": settings().playback_url_seconds}


def download_recording(key: str):
    validate_key(key)
    with blob_client() as client:
        metadata = client.head(key)
        if not 0 < metadata.size <= MAX_BYTES:
            fail(422, "recording_limit", "Use a recording under 24 MB.")
        result = client.get(key, access="private", timeout=30)
        if not 0 < len(result.content) <= MAX_BYTES:
            fail(422, "recording_limit", "Use a recording under 24 MB.")
    return (PurePosixPath(key).name, result.content)


def delete_recording(key: str):
    validate_key(key)
    # Local meetings may reference production files for testing. Never remove a
    # file belonging to the other environment when deleting that meeting.
    if not key.startswith(prefix() + "/"):
        return
    with blob_client() as client:
        try:
            client.delete(key)
        except BlobNotFoundError:
            pass
