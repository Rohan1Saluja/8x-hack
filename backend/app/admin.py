"""Local operator actions. No HTTP budget-grant endpoint is exposed."""

import argparse
from pathlib import Path
from uuid import UUID

from app.config import settings
from app.errors import AppError
from app.integrations.ai import groq_client
from app.services import budget_service, recording_service


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("verify-models")
    recording = sub.add_parser("import-recording")
    recording.add_argument("--meeting-id", type=UUID, required=True)
    recording.add_argument("--file", type=Path, required=True)
    grant = sub.add_parser("approve-groq-budget")
    grant.add_argument("--audio-seconds", type=int, required=True)
    grant.add_argument("--text-requests", type=int, required=True)
    grant.add_argument("--text-tokens", type=int, required=True)
    grant.add_argument("--hours", type=int, choices=range(1, 25), required=True)
    grant.add_argument("--note", required=True)
    grant.add_argument("--confirm-free-no-payment", action="store_true", required=True)
    args = parser.parse_args()
    if args.command == "import-recording":
        try:
            result = recording_service.import_recording(args.meeting_id, args.file)
        except AppError as exc:
            raise SystemExit(exc.detail["message"]) from exc
        print(f"Blob recording attached ({result['duration_seconds']:.1f}s). Refresh the meeting.")
        return
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
    try:
        budget_service.approve(
            args.audio_seconds, args.text_requests, args.text_tokens, args.hours, args.note
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    print(
        "Short-lived free budget saved. Reservations are retained. No provider inference was requested."
    )


if __name__ == "__main__":
    main()
