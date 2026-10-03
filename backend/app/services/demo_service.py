"""Explicit opt-in sample data; never claims provider-generated results or media."""

import json
from pathlib import Path
from uuid import uuid4, uuid5

from app import db
from app.evidence_schemas import Answer, Segment, Summary, validate_evidence
from app.repositories import discovery_repository, evidence_repository
from app.schemas import meeting_out


def seed(owner):
    samples = json.loads((Path(__file__).parents[1] / "demo_meetings.json").read_text())
    result = []
    with db.connection() as conn:
        # Serialize repeated clicks for this owner; all four samples commit atomically.
        conn.execute("select id from app.users where id=%s for update", (owner,))
        for sample in samples:
            existing = conn.execute(
                "select * from app.meetings where owner_id=%s and demo_seed_key=%s",
                (owner, sample["key"]),
            ).fetchone()
            if existing:
                result.append(meeting_out(existing))
                continue
            meeting_id = uuid4()
            row = conn.execute(
                "insert into app.meetings(id,owner_id,request_id,title,demo_seed_key,"
                "capture_state,transcription_state,summary_state) "
                "values(%s,%s,%s,%s,%s,'stopped','ready','ready') returning *",
                (meeting_id, owner, uuid4(), sample["title"], sample["key"]),
            ).fetchone()
            segments = [
                Segment(
                    id=uuid5(meeting_id, str(i)),
                    ordinal=i,
                    text=text,
                    start_seconds=i * 20,
                    end_seconds=(i + 1) * 20,
                    speaker=None,
                )
                for i, text in enumerate(sample["segments"])
            ]
            rows = [s.model_dump() for s in segments]

            def fact(text, sources, segments=segments):
                return {"text": text, "source_segment_ids": [str(segments[i].id) for i in sources]}

            summary = Summary(
                overview=fact(sample["overview"], sample["overview_sources"]),
                topics=[fact(text, [i]) for i, text in enumerate(sample["segments"][1:], 1)],
                decisions=[fact(d["text"], d["sources"]) for d in sample["decisions"]],
                action_items=[
                    {
                        **fact(a["text"], a["sources"]),
                        "owner": a["owner"],
                        "due_date": a["due_date"],
                    }
                    for a in sample["actions"]
                ],
            )
            validate_evidence(summary, rows)
            for segment in segments:
                evidence_repository.insert_segment(conn, meeting_id, segment)
            evidence_repository.insert_summary(conn, meeting_id, "scripted-demo-not-ai", summary)
            for action in summary.action_items:
                evidence_repository.insert_action(conn, action, meeting_id)
            decision = summary.decisions[0]
            answer = validate_evidence(
                Answer(
                    answer=decision.text,
                    supported=True,
                    source_segment_ids=decision.source_segment_ids,
                ),
                rows,
            )
            evidence_repository.insert_question(
                conn, answer, meeting_id, "scripted-demo-not-ai", "What did we decide?", uuid4()
            )
            discovery_repository.save_highlight(conn, meeting_id, segments[2].id)
            result.append(meeting_out(row))
    return result
