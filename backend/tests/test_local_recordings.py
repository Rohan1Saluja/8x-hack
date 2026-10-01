import io
import time
import wave
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.errors import AppError
from app.integrations import ai, local_storage, storage
from app.main import app
from app.repositories import meeting_repository
from app.services import recording_service


def configure_local(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("RECORDING_STORAGE", "local")
    monkeypatch.setenv("LOCAL_RECORDINGS_DIR", str(tmp_path / "recordings"))
    monkeypatch.setenv("LOCAL_STORAGE_BASE_URL", "http://localhost:8000")
    monkeypatch.delenv("VERCEL", raising=False)
    settings.cache_clear()


@pytest.fixture
def local_files(monkeypatch, tmp_path):
    configure_local(monkeypatch, tmp_path)
    yield tmp_path
    settings.cache_clear()


def wav_bytes():
    content = io.BytesIO()
    with wave.open(content, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\0\0" * 8000)
    return content.getvalue()


def test_private_playback_range_expiry_and_deletion(local_files):
    with TestClient(app) as client:
        assert (local_files / "recordings").is_dir()
        assert client.get("/health").json()["configuration"]["storage"] is True
        local_storage.write_recording("meeting/clip.wav", wav_bytes())
        url = storage.playback_url("meeting/clip.wav")["url"]
        response = client.get(url, headers={"Range": "bytes=0-3"})
        assert response.status_code == 206 and response.content == b"RIFF"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["content-range"].startswith("bytes 0-3/")
        assert client.get("/local-recordings/not-a-token").status_code == 403
        assert client.get("/local-recordings/clip.wav").status_code == 403
        expired = jwt.encode(
            {"key": "meeting/clip.wav", "aud": local_storage._audience, "exp": time.time() - 1},
            local_storage._signing_key,
            algorithm="HS256",
        )
        assert client.get(f"/local-recordings/{expired}").status_code == 403
        wrong_signature = jwt.encode(
            {"key": "meeting/clip.wav", "aud": local_storage._audience, "exp": time.time() + 60},
            b"wrong-key-for-signature-test-32bytes",
            algorithm="HS256",
        )
        assert client.get(f"/local-recordings/{wrong_signature}").status_code == 403
        assert isinstance(storage.transcription_source("meeting/clip.wav"), Path)
        storage.delete_recording("meeting/clip.wav")
        storage.delete_recording("meeting/clip.wav")
        assert client.get(url).status_code == 404


@pytest.mark.parametrize(
    "key", ["../outside.wav", "/outside.wav", "a/../../outside.wav", "a\\b", "a//b", "", "a/./b"]
)
def test_path_traversal_rejected(local_files, key):
    with pytest.raises(AppError) as error:
        local_storage.write_recording(key, b"data")
    assert error.value.status_code == 404


def test_symlink_escape_rejected(local_files):
    outside = local_files / "outside.wav"
    outside.write_bytes(b"private")
    (local_storage.root() / "link.wav").symlink_to(outside)
    with pytest.raises(AppError):
        storage.playback_url("link.wav")
    with pytest.raises(AppError):
        storage.delete_recording("link.wav")
    assert outside.read_bytes() == b"private"


def test_changed_file_size_checked_before_transcription(local_files):
    local_storage.write_recording("clip.wav", wav_bytes())
    path = local_storage.recording_path("clip.wav")
    with path.open("wb") as handle:
        handle.truncate(local_storage.MAX_BYTES + 1)
    with pytest.raises(AppError) as error:
        storage.transcription_source("clip.wav")
    assert error.value.status_code == 422
    storage.delete_recording("clip.wav")


@pytest.mark.parametrize("name,value", [("APP_ENV", "production"), ("VERCEL", "1")])
def test_local_storage_cannot_start_in_production(local_files, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    settings.cache_clear()
    with pytest.raises(AppError) as error, TestClient(app):
        pass
    assert error.value.detail["code"] == "local_storage_disabled"


def new_meeting(client, token):
    response = client.post(
        "/meetings",
        headers=token(),
        json={
            "title": "Local sample",
            "meeting_url": "https://meet.google.com/abc-defg-hij",
            "request_id": str(uuid4()),
        },
    )
    assert response.status_code == 201
    return UUID(response.json()["id"])


def test_import_owner_playback_and_cleanup(client, token, monkeypatch, tmp_path):
    meeting_id = new_meeting(client, token)
    configure_local(monkeypatch, tmp_path)
    source = tmp_path / "sample.wav"
    source.write_bytes(wav_bytes())
    result = recording_service.import_local_recording(meeting_id, source)
    assert result["duration_seconds"] == 1
    url_path = f"/meetings/{meeting_id}/playback"
    assert client.get(url_path, headers=token("auth0|other")).status_code == 404
    playback = client.get(url_path, headers=token())
    assert playback.status_code == 200
    assert client.get(playback.json()["url"]).content == source.read_bytes()
    with pytest.raises(AppError) as error:
        recording_service.import_local_recording(meeting_id, source)
    assert error.value.status_code == 409
    assert client.delete(f"/meetings/{meeting_id}", headers=token()).status_code == 204
    assert not list(local_storage.root().rglob("*.wav"))
    assert client.get(playback.json()["url"]).status_code == 404


def test_import_failure_removes_copied_file(client, token, monkeypatch, tmp_path):
    meeting_id = new_meeting(client, token)
    configure_local(monkeypatch, tmp_path)
    source = tmp_path / "sample.wav"
    source.write_bytes(wav_bytes())

    def reject_attach(*args):
        raise RuntimeError("fixture database write failure")

    monkeypatch.setattr(meeting_repository, "attach_local_recording", reject_attach)
    with pytest.raises(RuntimeError):
        recording_service.import_local_recording(meeting_id, source)
    assert not list(local_storage.root().rglob("*.wav"))
    meeting = client.get(f"/meetings/{meeting_id}", headers=token()).json()
    assert meeting["recording_ready"] is False
    assert meeting["capture_state"] == "not_started"


@pytest.mark.parametrize("content", [b"not audio", wav_bytes()[:-10]])
def test_import_rejects_invalid_or_truncated_wav(local_files, content):
    source = local_files / "bad.wav"
    source.write_bytes(content)
    with pytest.raises(AppError) as error:
        recording_service.import_local_recording(uuid4(), source)
    assert error.value.status_code == 422


def test_groq_receives_local_file_not_localhost_url(local_files, monkeypatch):
    local_storage.write_recording("clip.wav", wav_bytes())
    source = storage.transcription_source("clip.wav")

    def transcribe(**kwargs):
        assert kwargs["file"] == source
        assert "url" not in kwargs
        return SimpleNamespace(
            model_dump=lambda: {"segments": [{"text": "Hello", "start": 0, "end": 1}]}
        )

    class FakeClient:
        audio = SimpleNamespace(transcriptions=SimpleNamespace(create=transcribe))

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(ai, "groq_client", FakeClient)
    assert ai.transcribe(uuid4(), source, 1)[0].text == "Hello"
