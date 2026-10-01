from uuid import UUID

import groq
from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb

from app import ai, db, jobs, storage
from app.config import settings
from app.errors import fail
from app.evidence_schemas import ActionUpdate, QuestionCreate
from app.meetings import current_user

router = APIRouter()


def segments_for(conn, meeting_id):
    return conn.execute(
        "select id,ordinal,text,start_seconds,end_seconds,speaker from app.transcript_segments where meeting_id=%s order by ordinal",
        (meeting_id,),
    ).fetchall()


def run_failure(meeting_id, job_key, lease, exc):
    if isinstance(exc, groq.RateLimitError):
        code, status, message = (
            "provider_quota",
            429,
            "Groq rejected the request at its account limit. Wait, then review available free quota.",
        )
    elif isinstance(exc, (groq.AuthenticationError, groq.PermissionDeniedError)):
        code, status, message = (
            "provider_access",
            503,
            "Check the Groq key and Free account model access.",
        )
    elif isinstance(exc, ValueError):
        code, status, message = (
            "invalid_evidence",
            502,
            "AI output failed evidence validation. Saved earlier stages are preserved.",
        )
    elif isinstance(exc, HTTPException):
        code, status, message = (
            "processing_dependency",
            exc.status_code,
            "Processing dependency unavailable. Check storage and provider configuration.",
        )
    else:
        code, status, message = (
            "provider_failure",
            502,
            "Processing was interrupted. Saved earlier stages are preserved.",
        )
    jobs.fail_job(meeting_id, job_key, lease, code)
    fail(status, code, message, True)


@router.get("/integrations")
def integrations(owner=Depends(current_user)):
    with db.connection() as conn:
        budget = conn.execute(
            "select expires_at,expires_at>now() as verified,audio_limit-audio_reserved as audio_seconds_remaining,request_limit-requests_reserved as text_requests_remaining,token_limit-tokens_reserved as text_tokens_remaining from app.provider_budget where provider='groq'"
        ).fetchone()
    return {
        "capture": {
            "available": False,
            "code": "capture_verification_required",
            "message": "Recall account free allowance, no-payment terms, retention charges and webhook access must be verified before the capture adapter is enabled.",
        },
        "ai": {"configured": bool(settings().groq_api_key.get_secret_value()), "budget": budget},
    }


@router.post("/meetings/{meeting_id}/send")
@router.post("/meetings/{meeting_id}/stop")
def blocked_capture(meeting_id: UUID, owner=Depends(current_user)):
    with db.connection() as conn:
        db.owned(conn, meeting_id, owner)
    fail(
        503,
        "capture_verification_required",
        "Capture is unavailable until Recall free account access and the webhook endpoint are verified. No bot request was sent.",
    )


@router.get("/meetings/{meeting_id}/evidence")
def get_evidence(meeting_id: UUID, owner=Depends(current_user)):
    with db.connection() as conn:
        db.owned(conn, meeting_id, owner)
        segments = segments_for(conn, meeting_id)
        summary = conn.execute(
            "select content from app.summaries where meeting_id=%s", (meeting_id,)
        ).fetchone()
        actions = conn.execute(
            "select id,text,owner,due_date,completed,source_segment_ids from app.action_items where meeting_id=%s order by created_at,id",
            (meeting_id,),
        ).fetchall()
        questions = conn.execute(
            "select id,question,answer,created_at from app.questions where meeting_id=%s order by created_at",
            (meeting_id,),
        ).fetchall()
        progress = conn.execute(
            "select job_key,stage,status,attempts,error_code,retry_after,lease_until,status='running' and lease_until<now() as interrupted from app.processing_jobs where meeting_id=%s order by job_key",
            (meeting_id,),
        ).fetchall()
    return {
        "segments": segments,
        "summary": summary["content"] if summary else None,
        "actions": actions,
        "questions": questions,
        "jobs": progress,
    }


@router.patch("/meetings/{meeting_id}/actions/{action_id}")
def update_action(
    meeting_id: UUID, action_id: UUID, body: ActionUpdate, owner=Depends(current_user)
):
    with db.connection() as conn:
        db.owned(conn, meeting_id, owner, lock=True)
        row = conn.execute(
            "update app.action_items set text=%s,owner=%s,due_date=%s,completed=%s where meeting_id=%s and id=%s returning id,text,owner,due_date,completed,source_segment_ids",
            (body.text, body.owner, body.due_date, body.completed, meeting_id, action_id),
        ).fetchone()
        if not row:
            fail(404, "action_not_found", "Action item not found.")
    return row


@router.post("/meetings/{meeting_id}/recover")
def recover_processing(meeting_id: UUID, owner=Depends(current_user)):
    return jobs.recover(meeting_id, owner)


@router.post("/meetings/{meeting_id}/transcribe")
def transcribe(meeting_id: UUID, owner=Depends(current_user)):
    with db.connection() as conn:
        meeting = db.owned(conn, meeting_id, owner)
    if meeting["transcription_state"] == "ready":
        return {"status": "ready"}
    if (
        not meeting["recording_key"]
        or not meeting["recording_bytes"]
        or not meeting["duration_seconds"]
    ):
        fail(
            409,
            "recording_not_ready",
            "Capture must persist a validated recording before transcription.",
        )
    if (
        meeting["capture_state"] != "stopped"
        or meeting["recording_bytes"] > 24000000
        or meeting["duration_seconds"] > 180
    ):
        fail(422, "recording_limit", "Use a stopped recording under 3 minutes and 24 MB.")
    if not settings().groq_api_key.get_secret_value():
        fail(503, "ai_not_configured", "Configure GROQ_API_KEY after verifying the Free plan.")
    # Reserve the entire maximum duration on every attempt, including uncertain failures.
    lease = jobs.claim(
        meeting_id, owner, "transcribe", "transcribe", meeting["recording_key"], audio=180
    )
    if lease is None:
        return {"status": "ready"}
    try:
        url = storage.playback_url(meeting["recording_key"])["url"]
        segments = ai.transcribe(meeting_id, url, meeting["duration_seconds"])
        with db.connection() as conn:
            jobs.finish(conn, meeting_id, "transcribe", lease)
            for segment in segments:
                conn.execute(
                    "insert into app.transcript_segments(id,meeting_id,ordinal,text,start_seconds,end_seconds,speaker) values(%s,%s,%s,%s,%s,%s,null)",
                    (
                        segment.id,
                        meeting_id,
                        segment.ordinal,
                        segment.text,
                        segment.start_seconds,
                        segment.end_seconds,
                    ),
                )
        return {"status": "ready"}
    except Exception as exc:
        run_failure(meeting_id, "transcribe", lease, exc)


@router.post("/meetings/{meeting_id}/summarize")
def summarize(meeting_id: UUID, owner=Depends(current_user)):
    with db.connection() as conn:
        meeting = db.owned(conn, meeting_id, owner)
        segments = segments_for(conn, meeting_id)
    if meeting["summary_state"] == "ready":
        return {"status": "ready"}
    if not segments:
        fail(409, "transcript_not_ready", "Generate a transcript first.")
    if not settings().groq_api_key.get_secret_value():
        fail(503, "ai_not_configured", "Configure GROQ_API_KEY after verifying the Free plan.")
    payload, tokens = ai.text_request(segments)
    lease = jobs.claim(meeting_id, owner, "summarize", "summarize", "summary-v1", tokens=tokens)
    if lease is None:
        return {"status": "ready"}
    try:
        summary = ai.generate(payload, segments)
        with db.connection() as conn:
            jobs.finish(conn, meeting_id, "summarize", lease)
            conn.execute(
                "insert into app.summaries(meeting_id,content,model) values(%s,%s,%s)",
                (
                    meeting_id,
                    Jsonb(summary.model_dump(exclude={"action_items"})),
                    settings().groq_text_model,
                ),
            )
            for action in summary.action_items:
                conn.execute(
                    "insert into app.action_items(meeting_id,text,owner,due_date,source_segment_ids) values(%s,%s,%s,%s,%s)",
                    (
                        meeting_id,
                        action.text,
                        action.owner,
                        action.due_date,
                        [UUID(s) for s in action.source_segment_ids],
                    ),
                )
        return {"status": "ready"}
    except Exception as exc:
        run_failure(meeting_id, "summarize", lease, exc)


@router.post("/meetings/{meeting_id}/questions")
def ask(meeting_id: UUID, body: QuestionCreate, owner=Depends(current_user)):
    with db.connection() as conn:
        db.owned(conn, meeting_id, owner)
        saved = conn.execute(
            "select question,answer from app.questions where meeting_id=%s and request_id=%s",
            (meeting_id, body.request_id),
        ).fetchone()
        if saved:
            if saved["question"] != body.question:
                fail(409, "request_conflict", "Request ID already used for a different question.")
            return saved["answer"]
        segments = segments_for(conn, meeting_id)
    if not segments:
        fail(409, "transcript_not_ready", "Generate a transcript first.")
    if not settings().groq_api_key.get_secret_value():
        fail(503, "ai_not_configured", "Configure GROQ_API_KEY after verifying the Free plan.")
    payload, tokens = ai.text_request(segments, body.question)
    job_key = f"question:{body.request_id}"
    lease = jobs.claim(meeting_id, owner, "question", job_key, body.question, tokens=tokens)
    if lease is None:
        with db.connection() as conn:
            return conn.execute(
                "select answer from app.questions where meeting_id=%s and request_id=%s",
                (meeting_id, body.request_id),
            ).fetchone()["answer"]
    try:
        answer = ai.generate(payload, segments, question=True)
        with db.connection() as conn:
            jobs.finish(conn, meeting_id, job_key, lease)
            conn.execute(
                "insert into app.questions(meeting_id,request_id,question,answer,model) values(%s,%s,%s,%s,%s)",
                (
                    meeting_id,
                    body.request_id,
                    body.question,
                    Jsonb(answer.model_dump()),
                    settings().groq_text_model,
                ),
            )
        return answer
    except Exception as exc:
        run_failure(meeting_id, job_key, lease, exc)
