import hashlib
from datetime import datetime, timezone
from uuid import uuid4

from app import db
from app.errors import fail
from app.repositories import job_repository
from app.services import meeting_service

PROCESSING_STAGES = ("transcribe", "summarize")


def claim(meeting_id, owner, stage, job_key, input_text, *, audio=0, tokens=0):
    fingerprint = hashlib.sha256(input_text.encode()).hexdigest()
    lease = uuid4()
    with db.connection() as conn:
        meeting_service.require_owned(conn, meeting_id, owner)
        budget = job_repository.lock_budget(conn)
        now = datetime.now(timezone.utc)
        if not budget or budget["expires_at"] <= now:
            fail(
                503,
                "free_plan_unverified",
                "Verify the actual Groq Free account and approve a short-lived usage budget.",
            )
        meeting = meeting_service.require_owned(conn, meeting_id, owner, lock=True)
        job = job_repository.lock_job(conn, job_key=job_key, meeting_id=meeting_id)
        if job:
            if job["input_hash"] != fingerprint:
                fail(
                    409,
                    "request_conflict",
                    "Request ID has different content. Use a new request ID.",
                )
            if job["status"] == "ready":
                return None
            if job["status"] == "running" and job["lease_until"] > now:
                fail(
                    409,
                    "processing_active",
                    "This operation is already running. Refresh for progress.",
                    True,
                )
            if job["retry_after"] and job["retry_after"] > now:
                fail(429, "retry_later", "Wait at least one minute before retrying.", True)
            if job["attempts"] >= 3:
                fail(
                    409,
                    "retry_exhausted",
                    "Three attempts used. Review the failure before further processing.",
                )
        if budget["active_until"] and budget["active_until"] > now:
            fail(
                409,
                "provider_busy",
                "Another AI operation is running. Try again after it finishes.",
                True,
            )
        if stage == "question" and job is None:
            count = job_repository.count_questions(conn, meeting_id)["count"]
            if count >= 20:
                fail(
                    429, "question_limit", "This preparation build allows 20 questions per meeting."
                )
        text_requests = int(tokens > 0)
        if any(
            budget[a] + amount > budget[b]
            for a, b, amount in [
                ("audio_reserved", "audio_limit", audio),
                ("requests_reserved", "request_limit", text_requests),
                ("tokens_reserved", "token_limit", tokens),
            ]
        ):
            fail(
                429,
                "quota_exhausted",
                "The verified free usage budget is exhausted. Review account limits before retrying.",
            )
        if stage == "transcribe" and not meeting["recording_key"]:
            fail(409, "recording_not_ready", "No persisted recording is available.")
        if stage in ("summarize", "question") and meeting["transcription_state"] != "ready":
            fail(409, "transcript_not_ready", "Generate a transcript first.")
        job_repository.reserve_budget(
            conn, audio=audio, lease=lease, text_requests=text_requests, tokens=tokens
        )
        job_repository.start_job(
            conn,
            fingerprint=fingerprint,
            job_key=job_key,
            lease=lease,
            meeting_id=meeting_id,
            stage=stage,
        )
        if stage in PROCESSING_STAGES:
            job_repository.mark_running(conn, meeting_id=meeting_id, stage=stage)
    return lease


def finish(conn, meeting_id, job_key, lease, *, error=None):
    # Match claim's lock order to avoid deadlocks between recovery/completion and new work.
    job_repository.lock_budget_for_completion(conn)
    job_repository.lock_meeting(conn, meeting_id)
    row = job_repository.finish_job(
        conn, error=error, job_key=job_key, lease=lease, meeting_id=meeting_id
    )
    if not row:
        fail(409, "lease_lost", "Another attempt owns this operation. Reload the meeting.")
    stage = row["stage"]
    if stage in PROCESSING_STAGES:
        job_repository.finish_stage(conn, error=error, meeting_id=meeting_id, stage=stage)
    job_repository.release_budget(conn, lease)


def fail_job(meeting_id, job_key, lease, code):
    with db.connection() as conn:
        finish(conn, meeting_id, job_key, lease, error=code)


def recover(meeting_id, owner):
    with db.connection() as conn:
        meeting_service.require_owned(conn, meeting_id, owner, lock=True)
        expired = job_repository.recover_expired(conn, meeting_id)
        for row in expired:
            if row["stage"] in PROCESSING_STAGES:
                job_repository.mark_interrupted(conn, meeting_id=meeting_id, stage=row["stage"])
    return {"recovered": len(expired)}
