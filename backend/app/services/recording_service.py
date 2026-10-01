import io
import wave
from pathlib import Path
from uuid import UUID

from app import db
from app.errors import fail
from app.integrations import storage
from app.repositories import meeting_repository


def import_recording(meeting_id: UUID, source: Path):
    """Operator sample import; not an HTTP upload or live capture endpoint."""
    try:
        with source.open("rb") as handle:
            content = handle.read(storage.MAX_BYTES + 1)
    except OSError:
        fail(422, "invalid_recording_file", "Cannot read the supplied WAV file.")
    if not 0 < len(content) <= storage.MAX_BYTES:
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
    key = None
    try:
        with db.connection() as conn:
            meeting = meeting_repository.find_for_import(conn, meeting_id)
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
            key = storage.upload_recording(meeting_id, content)
            meeting_repository.attach_recording(conn, meeting_id, key, len(content), duration)
    except Exception:
        if key:
            storage.delete_recording(key)
        raise
    return {"recording_bytes": len(content), "duration_seconds": duration}
