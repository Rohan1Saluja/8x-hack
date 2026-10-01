from datetime import datetime, timedelta, timezone

from app import db
from app.repositories import budget_repository


def approve(audio_seconds, text_requests, text_tokens, hours, note):
    if (
        not 1 <= hours <= 24
        or min(audio_seconds, text_requests, text_tokens) < 0
        or len(note.strip()) < 20
    ):
        raise ValueError(
            "Use non-negative remaining quotas and a meaningful verification note (no secrets)."
        )
    now = datetime.now(timezone.utc)
    with db.connection() as conn:
        budget_repository.lock_approval(conn)
        budget = budget_repository.lock_budget(conn)
        if budget and budget["active_until"] and budget["active_until"] > now:
            raise ValueError(
                "Wait for the current provider operation before approving a new budget."
            )
        audio = budget["audio_reserved"] if budget else 0
        requests = budget["requests_reserved"] if budget else 0
        tokens = budget["tokens_reserved"] if budget else 0
        budget_repository.approve(
            conn,
            verified_at=now,
            expires_at=now + timedelta(hours=hours),
            note=note,
            audio_limit=audio + audio_seconds,
            request_limit=requests + text_requests,
            token_limit=tokens + text_tokens,
        )
