from uuid import UUID

import groq

from app import db
from app.config import settings
from app.errors import AppError, fail
from app.evidence_schemas import ActionUpdate, QuestionCreate
from app.integrations import ai, storage
from app.repositories import evidence_repository
from app.services import job_service as jobs
from app.services import meeting_service


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
    elif isinstance(exc, AppError):
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


def integrations(owner):
    with db.connection() as conn:
        budget = evidence_repository.get_budget_status(conn)
    return {
        "capture": {
            "available": False,
            "code": "capture_verification_required",
            "message": "Recall account free allowance, no-payment terms, retention charges and webhook access must be verified before the capture adapter is enabled.",
        },
        "ai": {"configured": bool(settings().groq_api_key.get_secret_value()), "budget": budget},
    }


def blocked_capture(meeting_id: UUID, owner):
    with db.connection() as conn:
        meeting_service.require_owned(conn, meeting_id, owner)
    fail(
        503,
        "capture_verification_required",
        "Capture is unavailable until Recall free account access and the webhook endpoint are verified. No bot request was sent.",
    )


def get_evidence(meeting_id: UUID, owner):
    with db.connection() as conn:
        meeting_service.require_owned(conn, meeting_id, owner)
        segments = evidence_repository.list_segments(conn, meeting_id)
        summary = evidence_repository.get_summary(conn, meeting_id)
        actions = evidence_repository.list_actions(conn, meeting_id)
        questions = evidence_repository.list_questions(conn, meeting_id)
        progress = evidence_repository.list_jobs(conn, meeting_id)
    return {
        "segments": segments,
        "summary": summary["content"] if summary else None,
        "actions": actions,
        "questions": questions,
        "jobs": progress,
    }


def update_action(meeting_id: UUID, action_id: UUID, body: ActionUpdate, owner):
    with db.connection() as conn:
        meeting_service.require_owned(conn, meeting_id, owner, lock=True)
        row = evidence_repository.update_action(
            conn,
            action_id=action_id,
            action_owner=body.owner,
            completed=body.completed,
            due_date=body.due_date,
            meeting_id=meeting_id,
            text=body.text,
        )
        if not row:
            fail(404, "action_not_found", "Action item not found.")
    return row


def recover_processing(meeting_id: UUID, owner):
    return jobs.recover(meeting_id, owner)


def transcribe(meeting_id: UUID, owner):
    with db.connection() as conn:
        meeting = meeting_service.require_owned(conn, meeting_id, owner)
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
        recording = storage.download_recording(meeting["recording_key"])
        segments = ai.transcribe(meeting_id, recording, meeting["duration_seconds"])
        with db.connection() as conn:
            jobs.finish(conn, meeting_id, "transcribe", lease)
            for segment in segments:
                evidence_repository.insert_segment(conn, meeting_id=meeting_id, segment=segment)
        return {"status": "ready"}
    except Exception as exc:
        run_failure(meeting_id, "transcribe", lease, exc)


def summarize(meeting_id: UUID, owner):
    with db.connection() as conn:
        meeting = meeting_service.require_owned(conn, meeting_id, owner)
        segments = evidence_repository.list_segments(conn, meeting_id)
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
            evidence_repository.insert_summary(
                conn, meeting_id=meeting_id, model=settings().groq_text_model, summary=summary
            )
            for action in summary.action_items:
                evidence_repository.insert_action(conn, action=action, meeting_id=meeting_id)
        return {"status": "ready"}
    except Exception as exc:
        run_failure(meeting_id, "summarize", lease, exc)


def ask(meeting_id: UUID, body: QuestionCreate, owner):
    with db.connection() as conn:
        meeting_service.require_owned(conn, meeting_id, owner)
        saved = evidence_repository.find_question(
            conn, meeting_id=meeting_id, request_id=body.request_id
        )
        if saved:
            if saved["question"] != body.question:
                fail(409, "request_conflict", "Request ID already used for a different question.")
            return saved["answer"]
        segments = evidence_repository.list_segments(conn, meeting_id)
    if not segments:
        fail(409, "transcript_not_ready", "Generate a transcript first.")
    if not settings().groq_api_key.get_secret_value():
        fail(503, "ai_not_configured", "Configure GROQ_API_KEY after verifying the Free plan.")
    payload, tokens = ai.text_request(segments, body.question)
    job_key = f"question:{body.request_id}"
    lease = jobs.claim(meeting_id, owner, "question", job_key, body.question, tokens=tokens)
    if lease is None:
        with db.connection() as conn:
            return evidence_repository.get_answer(
                conn, meeting_id=meeting_id, request_id=body.request_id
            )["answer"]
    try:
        answer = ai.generate(payload, segments, question=True)
        with db.connection() as conn:
            jobs.finish(conn, meeting_id, job_key, lease)
            evidence_repository.insert_question(
                conn,
                answer=answer,
                meeting_id=meeting_id,
                model=settings().groq_text_model,
                question=body.question,
                request_id=body.request_id,
            )
        return answer
    except Exception as exc:
        run_failure(meeting_id, job_key, lease, exc)
