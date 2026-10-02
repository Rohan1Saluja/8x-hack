"""Deterministic, zero-provider demo transitions. No recording/evidence is fabricated."""

from datetime import datetime, timezone

from app import db
from app.errors import fail
from app.repositories import meeting_repository
from app.schemas import LifecycleAction, meeting_out
from app.services.meeting_service import require_owned

AUTO_NEXT = {"joining": "awaiting_admission", "transcribing": "summarizing", "summarizing": "ready"}


def transition(meeting_id, owner, action: str, body: LifecycleAction):
    with db.connection() as conn:
        meeting = require_owned(conn, meeting_id, owner, lock=True)
        # A stale replay is a read, never another transition (including retries).
        if body.expected_version != meeting["lifecycle_version"]:
            return meeting_out(meeting)
        state = meeting["demo_state"]
        consent = False
        failure = None
        if action in ("send", "retry-capture"):
            if action == "send" and state is not None:
                return meeting_out(meeting)
            if action == "retry-capture" and state != "failed":
                fail(409, "invalid_transition", "Only a failed demo capture can be retried.")
            if not body.consent:
                fail(
                    422,
                    "consent_required",
                    "Confirm the recording notice before sending the demo notetaker.",
                )
            if (
                meeting["recording_key"]
                or meeting["transcription_state"] != "pending"
                or meeting["summary_state"] != "pending"
                or meeting_repository.has_running_job(conn, meeting_id)
            ):
                fail(
                    409,
                    "meeting_not_empty",
                    "Use a new meeting for demo capture. Existing evidence is preserved.",
                )
            if not state and meeting["capture_state"] != "not_started":
                fail(409, "invalid_transition", "This meeting already has capture progress.")
            target, capture, consent = "joining", "joining", True
        elif action == "advance":
            target = AUTO_NEXT.get(state)
            if not target:
                return meeting_out(meeting)
            elapsed = (datetime.now(timezone.utc) - meeting["lifecycle_updated_at"]).total_seconds()
            if elapsed < 2:
                return meeting_out(meeting)
            capture = "awaiting_admission" if target == "awaiting_admission" else "stopped"
        elif action == "admit":
            if state != "awaiting_admission":
                fail(
                    409,
                    "invalid_transition",
                    "The demo notetaker must reach the waiting room first.",
                )
            target, capture = "recording", "recording"
        elif action == "stop":
            if state in ("joining", "awaiting_admission"):
                target, capture, failure = "failed", "failed", "demo_cancelled"
            elif state == "recording":
                target, capture = "transcribing", "stopped"
            else:
                return meeting_out(meeting)
        else:
            fail(404, "unknown_action", "Unknown lifecycle action.")
        updated = meeting_repository.transition_demo(
            conn, meeting_id, target, capture, failure, consent
        )
    return meeting_out(updated)
