import io
import wave
from pathlib import Path
from uuid import UUID, uuid4

from app import db
from app.errors import fail
from app.integrations import local_storage
from app.repositories import meeting_repository


def playback_file(token: str):
    return local_storage.playback_file(token)


def import_local_recording(meeting_id: UUID, source: Path):
    """Trusted local operator command; not an HTTP upload or capture endpoint."""
    local_storage.require_local()
    try:
        with source.open("rb") as handle:
            content = handle.read(local_storage.MAX_BYTES + 1)
    except OSError:
        fail(422, "invalid_recording_file", "Cannot read the supplied WAV file.")
    if not 0 < len(content) <= local_storage.MAX_BYTES:
        fail(422, "recording_limit", "Use a WAV file under 3 minutes and 24 MB.")
    try:
        with wave.open(io.BytesIO(content), "rb") as audio:
            frames = audio.getnframes()
            duration = frames / audio.getframerate()
            expected = frames * audio.getnchannels() * audio.getsampwidth()
            if not 0 < duration <= 180 or len(audio.readframes(frames)) != expected:
                raise ValueError("Invalid WAV length")
    except (wave.Error, EOFError, ValueError, ZeroDivisionError):
        fail(422, "invalid_recording_file", "Use a complete PCM WAV file under 3 minutes.")
    key = f"{meeting_id}/{uuid4()}.wav"
    written = False
    try:
        with db.connection() as conn:
            meeting = meeting_repository.find_for_local_import(conn, meeting_id)
            if not meeting:
                fail(404, "meeting_not_found", "Meeting not found in the configured database.")
            if (
                meeting["recording_key"]
                or meeting["capture_state"] != "not_started"
                or meeting["transcription_state"] != "pending"
                or meeting["summary_state"] != "pending"
                or meeting_repository.has_running_job(conn, meeting_id)
            ):
                fail(409, "meeting_not_empty", "Import into a new meeting with no recording.")
            local_storage.write_recording(key, content)
            written = True
            meeting_repository.attach_local_recording(conn, meeting_id, key, len(content), duration)
    except Exception:
        if written:
            local_storage.delete_recording(key)
        raise
    return {"recording_bytes": len(content), "duration_seconds": duration}
