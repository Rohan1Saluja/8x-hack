import io
import wave
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from vercel.blob import BlobNotFoundError

from app.config import settings
from app.errors import AppError
from app.integrations import storage
from app.repositories import meeting_repository
from app.services import recording_service


@pytest.fixture
def blob(monkeypatch):
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "fixture-token-not-a-real-credential")
    monkeypatch.delenv("VERCEL", raising=False)
    settings.cache_clear()
    objects = {}
    calls = []

    class FakeBlob:
        def __init__(self, token):
            assert token == "fixture-token-not-a-real-credential"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def put(self, key, content, **kwargs):
            assert kwargs["access"] == "private"
            assert kwargs["overwrite"] is False and kwargs["add_random_suffix"] is False
            objects[key] = content
            calls.append(("put", key))
            return SimpleNamespace(pathname=key)

        def head(self, key):
            if key not in objects:
                raise BlobNotFoundError()
            return SimpleNamespace(size=len(objects[key]))

        def get(self, key, **kwargs):
            assert kwargs["access"] == "private" and kwargs["timeout"] == 30
            calls.append(("get", key))
            return SimpleNamespace(content=objects[key])

        def delete(self, key):
            calls.append(("delete", key))
            if objects.pop(key, None) is None:
                raise BlobNotFoundError()

    monkeypatch.setattr(storage, "BlobClient", FakeBlob)
    yield objects, calls
    settings.cache_clear()


def wav_bytes():
    content = io.BytesIO()
    with wave.open(content, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\0\0" * 8000)
    return content.getvalue()


def test_private_blob_lifecycle(blob):
    key = storage.upload_recording(uuid4(), wav_bytes())
    assert key.startswith("development/")
    assert storage.playback_descriptor(key) == {"pathname": key, "expires_in": 300}
    assert storage.download_recording(key)[1] == wav_bytes()
    storage.delete_recording(key)
    storage.delete_recording(key)
    assert blob[0] == {}


def test_shared_production_file_is_not_deleted_by_local_db(blob, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    settings.cache_clear()
    key = storage.upload_recording(uuid4(), wav_bytes())
    assert key.startswith("production/")
    monkeypatch.setenv("APP_ENV", "development")
    settings.cache_clear()
    assert storage.download_recording(key)[1] == wav_bytes()
    storage.delete_recording(key)
    assert key in blob[0]
    assert not any(op == "delete" for op, _ in blob[1])


@pytest.mark.parametrize(
    "key", ["../secret", "https://example.com/audio.wav", "recordings/old.wav"]
)
def test_invalid_blob_path_rejected(blob, key):
    for operation in [
        storage.playback_descriptor,
        storage.download_recording,
        storage.delete_recording,
    ]:
        with pytest.raises(AppError) as error:
            operation(key)
        assert error.value.status_code == 409
    assert blob[1] == []


def test_missing_token_and_provider_error_do_not_expose_secrets(blob, monkeypatch):
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "")
    settings.cache_clear()
    with pytest.raises(AppError) as error:
        storage.upload_recording(uuid4(), b"audio")
    assert error.value.status_code == 503
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "fixture-token-not-a-real-credential")
    settings.cache_clear()

    def broken_client(**kwargs):
        raise RuntimeError("provider error with credential=" + kwargs["token"])

    monkeypatch.setattr(storage, "BlobClient", broken_client)
    with pytest.raises(AppError) as error:
        storage.upload_recording(uuid4(), b"audio")
    assert error.value.status_code == 502
    assert "fixture-token" not in str(error.value.detail)


def test_oversized_recording_not_downloaded(blob, monkeypatch):
    key = storage.upload_recording(uuid4(), wav_bytes())
    monkeypatch.setattr(storage, "MAX_BYTES", 1)
    with pytest.raises(AppError) as error:
        storage.download_recording(key)
    assert error.value.status_code == 422
    assert not any(op == "get" for op, _ in blob[1])


def create_meeting(client, token):
    response = client.post(
        "/meetings",
        headers=token(),
        json={
            "title": "Blob sample",
            "meeting_url": "https://meet.google.com/abc-defg-hij",
            "request_id": str(uuid4()),
        },
    )
    assert response.status_code == 201
    return UUID(response.json()["id"])


def test_import_playback_ownership_and_delete(client, token, blob, tmp_path):
    meeting_id = create_meeting(client, token)
    source = tmp_path / "sample.wav"
    source.write_bytes(wav_bytes())
    assert recording_service.import_recording(meeting_id, source)["duration_seconds"] == 1
    route = f"/meetings/{meeting_id}"
    assert client.get(route + "/playback", headers=token("auth0|other")).status_code == 404
    playback = client.get(route + "/playback", headers=token()).json()
    assert playback["pathname"] in blob[0]
    assert "url" not in playback and "token" not in playback
    with pytest.raises(AppError) as error:
        recording_service.import_recording(meeting_id, source)
    assert error.value.status_code == 409
    assert client.delete(route, headers=token()).status_code == 204
    assert blob[0] == {} and source.is_file()


def test_failed_import_removes_uploaded_blob(client, token, blob, tmp_path, monkeypatch):
    meeting_id = create_meeting(client, token)
    source = tmp_path / "sample.wav"
    source.write_bytes(wav_bytes())

    def reject_attach(*args):
        raise RuntimeError("fixture database failure")

    monkeypatch.setattr(meeting_repository, "attach_recording", reject_attach)
    with pytest.raises(RuntimeError):
        recording_service.import_recording(meeting_id, source)
    assert blob[0] == {}
    assert client.get(f"/meetings/{meeting_id}", headers=token()).json()["recording_ready"] is False
