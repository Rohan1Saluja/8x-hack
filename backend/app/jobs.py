import hashlib
from datetime import datetime, timezone
from uuid import uuid4

from app import db
from app.errors import fail

STAGE_COLUMN = {"transcribe": "transcription_state", "summarize": "summary_state"}


def claim(meeting_id, owner, stage, job_key, input_text, *, audio=0, tokens=0):
    fingerprint = hashlib.sha256(input_text.encode()).hexdigest()
    lease = uuid4()
    with db.connection() as conn:
        db.owned(conn, meeting_id, owner)
        budget = conn.execute(
            "select * from app.provider_budget where provider='groq' for update"
        ).fetchone()
        now = datetime.now(timezone.utc)
        if not budget or budget["expires_at"] <= now:
            fail(
                503,
                "free_plan_unverified",
                "Verify the actual Groq Free account and approve a short-lived usage budget.",
            )
        meeting = db.owned(conn, meeting_id, owner, lock=True)
        job = conn.execute(
            "select * from app.processing_jobs where meeting_id=%s and job_key=%s for update",
            (meeting_id, job_key),
        ).fetchone()
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
            count = conn.execute(
                "select count(*) as count from app.processing_jobs where meeting_id=%s and stage='question'",
                (meeting_id,),
            ).fetchone()["count"]
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
        conn.execute(
            "update app.provider_budget set audio_reserved=audio_reserved+%s, requests_reserved=requests_reserved+%s, "
            "tokens_reserved=tokens_reserved+%s,active_token=%s,active_until=now()+interval '5 minutes' where provider='groq'",
            (audio, text_requests, tokens, lease),
        )
        conn.execute(
            "insert into app.processing_jobs(meeting_id,job_key,stage,status,attempts,input_hash,lease_token,lease_until) "
            "values(%s,%s,%s,'running',1,%s,%s,now()+interval '5 minutes') "
            "on conflict(meeting_id,job_key) do update set status='running',attempts=app.processing_jobs.attempts+1,"
            "lease_token=excluded.lease_token,lease_until=excluded.lease_until,error_code=null,retry_after=null",
            (meeting_id, job_key, stage, fingerprint, lease),
        )
        if stage in STAGE_COLUMN:
            # Column comes exclusively from this constant mapping, never from a user value.
            conn.execute(
                f"update app.meetings set {STAGE_COLUMN[stage]}='running',failure_code=null where id=%s",
                (meeting_id,),
            )
    return lease


def finish(conn, meeting_id, job_key, lease, *, error=None):
    # Match claim's lock order to avoid deadlocks between recovery/completion and new work.
    conn.execute("select provider from app.provider_budget where provider='groq' for update")
    conn.execute("select id from app.meetings where id=%s for update", (meeting_id,))
    row = conn.execute(
        "update app.processing_jobs set status=%s,error_code=%s,retry_after=case when %s then now()+interval '60 seconds' else null end "
        "where meeting_id=%s and job_key=%s and lease_token=%s and status='running' returning stage",
        ("failed" if error else "ready", error, bool(error), meeting_id, job_key, lease),
    ).fetchone()
    if not row:
        fail(409, "lease_lost", "Another attempt owns this operation. Reload the meeting.")
    stage = row["stage"]
    if stage in STAGE_COLUMN:
        conn.execute(
            f"update app.meetings set {STAGE_COLUMN[stage]}=%s,failure_code=%s where id=%s",
            ("failed" if error else "ready", error, meeting_id),
        )
    conn.execute(
        "update app.provider_budget set active_token=null,active_until=null where provider='groq' and active_token=%s",
        (lease,),
    )


def fail_job(meeting_id, job_key, lease, code):
    with db.connection() as conn:
        finish(conn, meeting_id, job_key, lease, error=code)


def recover(meeting_id, owner):
    with db.connection() as conn:
        db.owned(conn, meeting_id, owner, lock=True)
        expired = conn.execute(
            "update app.processing_jobs set status='failed',error_code='interrupted',retry_after=null "
            "where meeting_id=%s and status='running' and lease_until<now() returning stage",
            (meeting_id,),
        ).fetchall()
        for row in expired:
            if row["stage"] in STAGE_COLUMN:
                conn.execute(
                    f"update app.meetings set {STAGE_COLUMN[row['stage']]}='failed',failure_code='interrupted' where id=%s",
                    (meeting_id,),
                )
    return {"recovered": len(expired)}
