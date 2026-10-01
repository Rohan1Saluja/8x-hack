from uuid import UUID

from fastapi import APIRouter, Depends

from app import db, storage
from app.auth import subject
from app.errors import fail
from app.schemas import MeetingCreate, MeetingOut, meeting_out

router = APIRouter()


def current_user(auth0_sub: str = Depends(subject)):
    return db.user_id(auth0_sub)


@router.get("/me")
def me(owner=Depends(current_user)):
    return {"id": owner}


@router.get("/meetings", response_model=list[MeetingOut])
def list_meetings(owner=Depends(current_user)):
    with db.connection() as conn:
        rows = conn.execute(
            "select * from app.meetings where owner_id=%s and deleted_at is null "
            "order by created_at desc limit 100", (owner,),
        ).fetchall()
    return [meeting_out(row) for row in rows]


@router.post("/meetings", response_model=MeetingOut, status_code=201)
def create_meeting(body: MeetingCreate, owner=Depends(current_user)):
    with db.connection() as conn:
        row = conn.execute(
            "insert into app.meetings(owner_id,title,meeting_url,request_id) values(%s,%s,%s,%s) "
            "on conflict(owner_id,request_id) do nothing returning *",
            (owner, body.title, body.meeting_url, body.request_id),
        ).fetchone()
        if row is None:
            row = conn.execute(
                "select * from app.meetings where owner_id=%s and request_id=%s and deleted_at is null",
                (owner, body.request_id),
            ).fetchone()
            if row is None or row["title"] != body.title or row["meeting_url"] != body.meeting_url:
                fail(409, "request_conflict", "This request ID was already used. Create a new meeting.")
    return meeting_out(row)


@router.get("/meetings/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: UUID, owner=Depends(current_user)):
    with db.connection() as conn:
        return meeting_out(db.owned(conn, meeting_id, owner))


@router.get("/meetings/{meeting_id}/playback")
def get_playback(meeting_id: UUID, owner=Depends(current_user)):
    with db.connection() as conn:
        meeting = db.owned(conn, meeting_id, owner)
    if not meeting["recording_key"]:
        fail(409, "recording_not_ready", "This meeting has no persisted recording yet.")
    return storage.playback_url(meeting["recording_key"])


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: UUID, owner=Depends(current_user)):
    # Keep the row until external cleanup succeeds, so failures are retryable.
    with db.connection() as conn:
        meeting = db.owned(conn, meeting_id, owner, lock=True)
        if meeting["capture_state"] in ("joining", "awaiting_admission", "recording"):
            fail(409, "capture_active", "Stop the notetaker before deleting this meeting.")
        if meeting["transcription_state"] == "running" or meeting["summary_state"] == "running":
            fail(409, "processing_active", "Finish or recover processing before deleting this meeting.")
        if meeting["recording_key"]:
            storage.delete_recording(meeting["recording_key"])
        conn.execute("delete from app.meetings where id=%s and owner_id=%s", (meeting_id, owner))
