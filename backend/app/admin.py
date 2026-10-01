"""Local operator actions. No HTTP budget-grant endpoint is exposed."""

import argparse
from datetime import datetime, timedelta, timezone

from app import db
from app.ai import groq_client
from app.config import settings


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("verify-models")
    grant = sub.add_parser("approve-groq-budget")
    grant.add_argument("--audio-seconds", type=int, required=True)
    grant.add_argument("--text-requests", type=int, required=True)
    grant.add_argument("--text-tokens", type=int, required=True)
    grant.add_argument("--hours", type=int, choices=range(1, 25), required=True)
    grant.add_argument("--note", required=True)
    grant.add_argument("--confirm-free-no-payment", action="store_true", required=True)
    args = parser.parse_args()
    if args.command == "verify-models":
        with groq_client() as client:
            available = {model.id for model in client.models.list().data}
        required = {settings().groq_text_model, settings().groq_transcription_model}
        missing = required - available
        if missing:
            raise SystemExit("Configured model unavailable: " + ", ".join(sorted(missing)))
        print(
            "Both configured models are available to this key. This does not verify the billing plan or quotas."
        )
        return
    if (
        min(args.audio_seconds, args.text_requests, args.text_tokens) < 0
        or len(args.note.strip()) < 20
    ):
        raise SystemExit(
            "Use non-negative remaining quotas and a meaningful verification note (no secrets)."
        )
    now = datetime.now(timezone.utc)
    with db.connection() as conn:
        conn.execute("select pg_advisory_xact_lock(88001)")
        budget = conn.execute(
            "select * from app.provider_budget where provider='groq' for update"
        ).fetchone()
        if budget and budget["active_until"] and budget["active_until"] > now:
            raise SystemExit(
                "Wait for the current provider operation before approving a new budget."
            )
        audio = budget["audio_reserved"] if budget else 0
        requests = budget["requests_reserved"] if budget else 0
        tokens = budget["tokens_reserved"] if budget else 0
        conn.execute(
            "insert into app.provider_budget(provider,verified_at,expires_at,verification_note,audio_limit,request_limit,token_limit) "
            "values('groq',%s,%s,%s,%s,%s,%s) on conflict(provider) do update set "
            "verified_at=excluded.verified_at,expires_at=excluded.expires_at,verification_note=excluded.verification_note,"
            "audio_limit=excluded.audio_limit,request_limit=excluded.request_limit,token_limit=excluded.token_limit",
            (
                now,
                now + timedelta(hours=args.hours),
                args.note,
                audio + args.audio_seconds,
                requests + args.text_requests,
                tokens + args.text_tokens,
            ),
        )
    print(
        "Short-lived free budget saved. Reservations are retained. No provider inference was requested."
    )


if __name__ == "__main__":
    main()
