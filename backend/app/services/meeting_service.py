from uuid import UUID

from app import db
from app.errors import fail
from app.integrations import storage
from app.repositories import meeting_repository
from app.schemas import MeetingCreate, meeting_out


def require_owned(conn, meeting_id, owner, *, lock=False):
    meeting = meeting_repository.find_owned(conn, meeting_id=meeting_id, owner=owner, lock=lock)
    if meeting is None:
        fail(404, "meeting_not_found", "Meeting not found.")
    return meeting


def list_meetings(owner):
    with db.connection() as conn:
        rows = meeting_repository.list_owned(conn, owner)
    return [meeting_out(row) for row in rows]


def create_meeting(body: MeetingCreate, owner):
    with db.connection() as conn:
        row = meeting_repository.create(
            conn,
            meeting_url=body.meeting_url,
            owner=owner,
            request_id=body.request_id,
            title=body.title,
        )
        if row is None:
            row = meeting_repository.find_by_request(conn, owner=owner, request_id=body.request_id)
            if row is None or row["title"] != body.title or row["meeting_url"] != body.meeting_url:
                fail(
                    409,
                    "request_conflict",
                    "This request ID was already used. Create a new meeting.",
                )
    return meeting_out(row)


def get_meeting(meeting_id: UUID, owner):
    with db.connection() as conn:
        return meeting_out(require_owned(conn, meeting_id, owner))


def get_playback(meeting_id: UUID, owner):
    with db.connection() as conn:
        meeting = require_owned(conn, meeting_id, owner)
    if not meeting["recording_key"]:
        fail(409, "recording_not_ready", "This meeting has no persisted recording yet.")
    return storage.playback_url(meeting["recording_key"])


def delete_meeting(meeting_id: UUID, owner):
    # Keep the row until external cleanup succeeds, so failures are retryable.
    with db.connection() as conn:
        meeting = require_owned(conn, meeting_id, owner, lock=True)
        if meeting["capture_state"] in ("joining", "awaiting_admission", "recording"):
            fail(409, "capture_active", "Stop the notetaker before deleting this meeting.")
        if meeting["transcription_state"] == "running" or meeting["summary_state"] == "running":
            fail(
                409,
                "processing_active",
                "Finish or recover processing before deleting this meeting.",
            )
        if meeting_repository.has_running_job(conn, meeting_id):
            fail(
                409,
                "processing_active",
                "Finish or recover processing before deleting this meeting.",
            )
        if meeting["recording_key"]:
            storage.delete_recording(meeting["recording_key"])
        meeting_repository.delete_owned(conn, meeting_id=meeting_id, owner=owner)
