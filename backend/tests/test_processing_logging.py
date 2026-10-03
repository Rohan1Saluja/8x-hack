from contextlib import contextmanager
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.integrations import ai, storage
from app.main import app
from app.repositories import evidence_repository
from app.routers.dependencies import current_user
from app.services import evidence_service


@pytest.fixture
def isolated(monkeypatch):
    meeting_id = str(uuid4())
    monkeypatch.setenv("GROQ_API_KEY", "fixture-key")
    settings.cache_clear()

    @contextmanager
    def connection():
        yield None

    monkeypatch.setattr(evidence_service.db, "connection", connection)
    monkeypatch.setattr(
        evidence_service.meeting_service,
        "require_owned",
        lambda *a: {
            "transcription_state": "pending",
            "recording_key": "fixture",
            "recording_bytes": 10,
            "duration_seconds": 10,
            "capture_state": "stopped",
        },
    )
    monkeypatch.setattr(evidence_service.jobs, "claim", lambda *a, **k: uuid4())
    monkeypatch.setattr(evidence_service.jobs, "finish", lambda *a, **k: None)
    monkeypatch.setattr(evidence_service.jobs, "fail_job", lambda *a, **k: None)
    monkeypatch.setattr(storage, "download_recording", lambda *a: ("fixture.wav", b"audio"))
    monkeypatch.setattr(ai, "transcribe", lambda *a: [object()])
    app.dependency_overrides[current_user] = lambda: object()
    try:
        with TestClient(app) as client:
            yield client, meeting_id
    finally:
        app.dependency_overrides.pop(current_user, None)
        settings.cache_clear()


@pytest.mark.parametrize(
    "stage,target,expected_status,expected_code",
    [
        ("recording_download", "storage", 502, "processing_dependency"),
        ("groq_transcription", "ai", 502, "provider_failure"),
        ("transcript_persistence", "persistence", 502, "provider_failure"),
    ],
)
def test_processing_trace_is_safe_and_response_unchanged(
    isolated,
    monkeypatch,
    stage,
    target,
    expected_status,
    expected_code,
):
    import io

    client, recording = isolated

    from app import processing_logging
    from app.services import evidence_service

    output = io.StringIO()
    monkeypatch.setattr(processing_logging.handler, "stream", output)
    sensitive = "private-url?token=secret transcript payload Authorization credential"

    def broken(*args, **kwargs):
        raise RuntimeError(sensitive)

    if target == "storage":
        # Exercise the actual SDK wrapper and its retained original exception chain.
        monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "fixture-private-token")
        settings.cache_clear()
        monkeypatch.setattr(storage, "BlobClient", broken)

        def download(_):
            with storage.blob_client():
                pass

        monkeypatch.setattr(storage, "download_recording", download)
    elif target == "ai":
        monkeypatch.setattr(ai, "transcribe", broken)
    else:
        monkeypatch.setattr(evidence_repository, "insert_segment", broken)

    response = client.post(f"/meetings/{recording}/transcribe")
    assert response.status_code == expected_status
    assert response.json()["detail"]["code"] == expected_code
    assert response.json()["detail"]["retryable"] is True
    if target == "storage":
        assert response.json()["detail"]["message"] == (
            "Processing dependency unavailable. Check storage and provider configuration."
        )
    log = output.getvalue()
    assert log.count("Meeting processing dependency failed") == 1
    assert f"stage={stage}" in log and recording in log
    assert "Traceback (most recent call last)" in log
    assert "RuntimeError" in log and "in broken" in log
    assert sensitive not in log + response.text
    assert "fixture-private-token" not in log + response.text
    assert "RuntimeError" not in response.text
    assert evidence_service.logger.propagate is False


def test_unconfigured_storage_retains_503(isolated, monkeypatch):
    import io

    client, recording = isolated

    from app import processing_logging

    output = io.StringIO()
    monkeypatch.setattr(processing_logging.handler, "stream", output)
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "")
    settings.cache_clear()

    def download(_):
        with storage.blob_client():
            pass

    monkeypatch.setattr(storage, "download_recording", download)
    response = client.post(f"/meetings/{recording}/transcribe")
    assert response.status_code == 503
    assert response.json()["detail"] == {
        "code": "processing_dependency",
        "message": "Processing dependency unavailable. Check storage and provider configuration.",
        "retryable": True,
    }
    assert output.getvalue().count("Meeting processing dependency failed") == 1
