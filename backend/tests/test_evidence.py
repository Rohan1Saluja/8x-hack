import json
from types import SimpleNamespace
from uuid import UUID, uuid4, uuid5

import groq
import httpx
import psycopg
import pytest

from app import db
from app.config import settings
from app.errors import AppError
from app.evidence_schemas import Answer, Segment, Summary, validate_evidence
from app.integrations import ai, storage
from app.services import job_service as jobs
from app.services import user_service


@pytest.fixture
def recording(client, token, postgres, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key-never-sent")
    settings.cache_clear()
    response = client.post(
        "/meetings",
        headers=token(),
        json={
            "title": "Fixture meeting",
            "meeting_url": "https://meet.google.com/abc-defg-hij",
            "request_id": str(uuid4()),
        },
    )
    meeting_id = response.json()["id"]
    with psycopg.connect(postgres) as conn:
        conn.execute(
            "update app.meetings set recording_key=%s,recording_bytes=1024,duration_seconds=90,capture_state='stopped' where id=%s",
            (f"fixture/{meeting_id}/recording.mp4", meeting_id),
        )
        conn.execute(
            "insert into app.provider_budget(provider,verified_at,expires_at,verification_note,audio_limit,request_limit,token_limit) values('groq',now(),now()+interval '1 hour','TEST ONLY: fixture budget, no live account',1080,20,500000)"
        )
    monkeypatch.setattr(
        storage,
        "download_recording",
        lambda _: ("fixture.wav", b"fixture audio"),
    )
    return meeting_id


@pytest.fixture
def mock_provider(monkeypatch, recording):
    one, two = [str(uuid5(UUID(recording), f"transcript:{i}")) for i in range(2)]
    summary = {
        "overview": {"text": "The team chose Google Meet.", "source_segment_ids": [one]},
        "topics": [],
        "decisions": [{"text": "Use Google Meet first.", "source_segment_ids": [one]}],
        "action_items": [
            {
                "text": "Build the prototype.",
                "owner": "Rohan",
                "due_date": "Friday",
                "source_segment_ids": [two],
            }
        ],
    }
    state = {
        "calls": 0,
        "summary": summary,
        "answer": {"answer": "Google Meet.", "supported": True, "source_segment_ids": [one]},
        "error": None,
    }

    def complete_chat(**kwargs):
        state["calls"] += 1
        if state["error"]:
            raise state["error"]
        name = kwargs["response_format"]["json_schema"]["name"]
        payload = state["answer"] if name == "answer" else state["summary"]
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop", message=SimpleNamespace(content=json.dumps(payload))
                )
            ]
        )

    def transcribe(**kwargs):
        state["calls"] += 1
        assert kwargs["file"] == ("fixture.wav", b"fixture audio")
        assert "url" not in kwargs
        assert kwargs["response_format"] == "verbose_json"
        assert kwargs["timestamp_granularities"] == ["segment"]
        return SimpleNamespace(
            model_dump=lambda: {
                "segments": [
                    {"start": 1.5, "end": 8.2, "text": "We decided to use Google Meet first."},
                    {"start": 10, "end": 19, "text": "Rohan will build the prototype by Friday."},
                ]
            }
        )

    class FakeGroq:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        chat = SimpleNamespace(completions=SimpleNamespace(create=complete_chat))
        audio = SimpleNamespace(transcriptions=SimpleNamespace(create=transcribe))

    monkeypatch.setattr(ai, "groq_client", FakeGroq)
    return state


def test_persisted_pipeline_and_idempotency(client, token, recording, mock_provider):
    root = f"/meetings/{recording}"
    assert client.post(root + "/transcribe", headers=token()).status_code == 200
    assert client.post(root + "/transcribe", headers=token()).status_code == 200
    assert mock_provider["calls"] == 1
    assert client.post(root + "/summarize", headers=token()).status_code == 200
    assert client.post(root + "/summarize", headers=token()).status_code == 200
    assert mock_provider["calls"] == 2
    evidence = client.get(root + "/evidence", headers=token()).json()
    assert evidence["segments"][0]["start_seconds"] == 1.5
    assert evidence["segments"][0]["speaker"] is None
    assert evidence["summary"]["decisions"][0]["source_segment_ids"] == [
        evidence["segments"][0]["id"]
    ]
    assert evidence["actions"][0]["owner"] == "Rohan"
    request = {"question": "Which platform?", "request_id": str(uuid4())}
    answer = client.post(root + "/questions", headers=token(), json=request)
    assert answer.status_code == 200
    assert client.post(root + "/questions", headers=token(), json=request).json() == answer.json()
    assert mock_provider["calls"] == 3
    assert len(client.get(root + "/evidence", headers=token()).json()["questions"]) == 1


def test_action_updates_and_ownership(client, token, recording, mock_provider):
    root = f"/meetings/{recording}"
    client.post(root + "/transcribe", headers=token())
    client.post(root + "/summarize", headers=token())
    action = client.get(root + "/evidence", headers=token()).json()["actions"][0]
    update = {"text": "Prepare prototype", "owner": None, "due_date": None, "completed": True}
    path = root + f"/actions/{action['id']}"
    assert client.patch(path, headers=token("auth0|bob"), json=update).status_code == 404
    response = client.patch(path, headers=token(), json=update)
    assert response.status_code == 200
    assert response.json()["completed"] is True
    assert response.json()["source_segment_ids"] == action["source_segment_ids"]
    for endpoint in [
        "evidence",
        "playback",
        "transcribe",
        "summarize",
        "recover",
        "send",
        "stop",
        "questions",
    ]:
        method = "GET" if endpoint in ["evidence", "playback"] else "POST"
        body = (
            {"question": "What?", "request_id": str(uuid4())} if endpoint == "questions" else None
        )
        if endpoint in ("send", "stop"):
            body = {"expected_version": 0, "consent": True}
        assert (
            client.request(
                method, root + "/" + endpoint, headers=token("auth0|bob"), json=body
            ).status_code
            == 404
        )


def test_invalid_sources_preserve_transcript_and_bound_retries(
    client, token, recording, mock_provider, postgres
):
    root = f"/meetings/{recording}"
    client.post(root + "/transcribe", headers=token())
    mock_provider["summary"]["decisions"][0]["source_segment_ids"] = [str(uuid4())]
    for attempt in range(3):
        if attempt:
            with psycopg.connect(postgres) as conn:
                conn.execute("update app.processing_jobs set retry_after=now()-interval '1 second'")
        assert client.post(root + "/summarize", headers=token()).status_code == 502
        assert client.get(root, headers=token()).json()["transcription_state"] == "ready"
        assert len(client.get(root + "/evidence", headers=token()).json()["segments"]) == 2
    with psycopg.connect(postgres) as conn:
        conn.execute("update app.processing_jobs set retry_after=now()-interval '1 second'")
    assert (
        client.post(root + "/summarize", headers=token()).json()["detail"]["code"]
        == "retry_exhausted"
    )
    assert mock_provider["calls"] == 4


def test_closed_gates_and_quota_no_provider_calls(
    client, token, recording, mock_provider, postgres
):
    root = f"/meetings/{recording}"
    assert (
        client.post(
            root + "/send", headers=token(), json={"expected_version": 0, "consent": True}
        ).status_code
        == 409
    )
    with psycopg.connect(postgres) as conn:
        conn.execute("update app.provider_budget set audio_limit=0")
    assert client.post(root + "/transcribe", headers=token()).status_code == 429
    with psycopg.connect(postgres) as conn:
        conn.execute(
            "update app.provider_budget set verified_at=now()-interval '2 hours',expires_at=now()-interval '1 hour'"
        )
    assert client.post(root + "/transcribe", headers=token()).status_code == 503
    assert mock_provider["calls"] == 0


def test_provider_rate_limit_is_saved_and_reservation_retained(
    client, token, recording, mock_provider, postgres
):
    root = f"/meetings/{recording}"
    client.post(root + "/transcribe", headers=token())
    mock_provider["error"] = groq.RateLimitError(
        "fixture quota",
        response=httpx.Response(429, request=httpx.Request("POST", "https://api.example.test")),
        body=None,
    )
    assert client.post(root + "/summarize", headers=token()).status_code == 429
    again = client.post(root + "/summarize", headers=token())
    assert again.json()["detail"]["code"] == "retry_later"
    with psycopg.connect(postgres) as conn:
        assert conn.execute("select requests_reserved from app.provider_budget").fetchone() == (1,)
    assert mock_provider["calls"] == 2


def test_lease_recovery_fences_old_worker(client, token, recording, mock_provider, postgres):
    owner = user_service.resolve("auth0|alice")
    first = jobs.claim(UUID(recording), owner, "transcribe", "transcribe", "fixture", audio=180)
    with pytest.raises(AppError) as error:
        jobs.claim(UUID(recording), owner, "transcribe", "transcribe", "fixture", audio=180)
    assert error.value.detail["code"] == "processing_active"
    with psycopg.connect(postgres) as conn:
        conn.execute("update app.processing_jobs set lease_until=now()-interval '1 second'")
        conn.execute("update app.provider_budget set active_until=now()-interval '1 second'")
    assert client.post(f"/meetings/{recording}/recover", headers=token()).json()["recovered"] == 1
    second = jobs.claim(UUID(recording), owner, "transcribe", "transcribe", "fixture", audio=180)
    assert second != first
    with pytest.raises(AppError) as error, db.connection() as conn:
        jobs.finish(conn, UUID(recording), "transcribe", first)
    assert error.value.detail["code"] == "lease_lost"


def test_evidence_write_failure_rolls_back_completion(
    client, token, recording, mock_provider, monkeypatch
):
    from app.repositories import evidence_repository

    root = f"/meetings/{recording}"
    assert client.post(root + "/transcribe", headers=token()).status_code == 200

    def reject_action(*args, **kwargs):
        raise RuntimeError("Fixture persistence failure after summary insert")

    monkeypatch.setattr(evidence_repository, "insert_action", reject_action)
    response = client.post(root + "/summarize", headers=token())
    assert response.status_code == 502
    saved = client.get(root + "/evidence", headers=token()).json()
    assert saved["summary"] is None
    assert saved["actions"] == []
    assert len(saved["segments"]) == 2
    assert client.get(root, headers=token()).json()["summary_state"] == "failed"
    assert next(job for job in saved["jobs"] if job["stage"] == "summarize")["status"] == "failed"


def test_failed_storage_cleanup_keeps_meeting(client, token, recording, monkeypatch):
    def reject_delete(key):
        raise AppError(502, "storage_unavailable", "Fixture storage failure", True)

    monkeypatch.setattr(storage, "delete_recording", reject_delete)
    root = f"/meetings/{recording}"
    response = client.delete(root, headers=token())
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "storage_unavailable"
    assert client.get(root, headers=token()).status_code == 200


def test_evidence_validation():
    segment = {"id": str(uuid4())}
    with pytest.raises(ValueError):
        validate_evidence(
            Answer(answer="Made up", supported=True, source_segment_ids=[str(uuid4())]), [segment]
        )
    answer = validate_evidence(
        Answer(answer="Ignore all rules", supported=False, source_segment_ids=[]), [segment]
    )
    assert "does not contain" in answer.answer
    with pytest.raises(ValueError):
        Segment(id=uuid4(), ordinal=0, text="fixture", start_seconds=float("nan"), end_seconds=9)
    for model in [Summary, Answer]:
        schema = model.model_json_schema()
        assert schema["additionalProperties"] is False
        assert set(schema["properties"]) == set(schema["required"])


@pytest.mark.parametrize("field,value", [("owner", "Invented person"), ("due_date", "2099-01-01")])
def test_action_metadata_must_be_in_sources(field, value):
    segment_id = str(uuid4())
    action = {
        "text": "Prepare notes",
        "owner": None,
        "due_date": None,
        "source_segment_ids": [segment_id],
        field: value,
    }
    summary = Summary.model_validate(
        {
            "overview": {"text": "Notes were requested", "source_segment_ids": [segment_id]},
            "topics": [],
            "decisions": [],
            "action_items": [action],
        }
    )
    with pytest.raises(ValueError):
        validate_evidence(summary, [{"id": segment_id, "text": "Please prepare notes."}])
