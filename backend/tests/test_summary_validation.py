import io
import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import groq
import httpx
import pytest
from fastapi.testclient import TestClient

from app import db, processing_logging
from app.config import settings
from app.errors import AppError
from app.evidence_errors import EvidenceReason, EvidenceValidationError
from app.evidence_schemas import Answer, Summary
from app.integrations import ai
from app.main import app
from app.routers.dependencies import current_user
from app.services import evidence_service


@pytest.fixture
def source():
    return [{"id": str(uuid4()), "text": "Alex will prepare notes by next Friday."}]


def summary(source):
    fact = {"text": "Prepare notes.", "source_segment_ids": [source[0]["id"]]}
    return {
        "overview": fact,
        "topics": [],
        "decisions": [],
        "action_items": [
            {**fact, "owner": "Alex", "due_date": "next Friday"},
        ],
    }


@pytest.fixture
def provider(monkeypatch, source):
    state = {"body": summary(source), "finish": "stop", "calls": 0, "error": None}

    def create(**kwargs):
        state["calls"] += 1
        if state["error"]:
            raise state["error"]
        body = state["body"]
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason=state["finish"],
                    message=SimpleNamespace(
                        content=body if isinstance(body, str) else json.dumps(body)
                    ),
                )
            ]
        )

    @contextmanager
    def client():
        yield SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    monkeypatch.setattr(ai, "groq_client", client)
    return state


@pytest.mark.parametrize("model", [Summary, Answer])
def test_decoding_schema_only_allows_stored_ids(model, source):
    schema = ai.evidence_json_schema(model, source)
    assert schema["$defs"]["StoredSegmentId"]["enum"] == [source[0]["id"]]
    nodes = [schema, *schema["$defs"].values()]
    citations = [
        node["properties"]["source_segment_ids"]
        for node in nodes
        if "source_segment_ids" in node.get("properties", {})
    ]
    assert citations
    assert all(node["items"] == {"$ref": "#/$defs/StoredSegmentId"} for node in citations)
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])


def test_schema_is_request_local_and_budget_includes_schema(source):
    other = [{"id": str(uuid4()), "text": "Other meeting"}]
    first, tokens = ai.text_request(source)
    second, _ = ai.text_request(other)
    assert tokens == len(json.dumps(first).encode()) + ai.MAX_COMPLETION_TOKENS + 1024
    assert (
        first["response_format"]["json_schema"]["schema"]["$defs"]["StoredSegmentId"]
        != (second["response_format"]["json_schema"]["schema"]["$defs"]["StoredSegmentId"])
    )


@pytest.mark.parametrize(
    "owner,due_date", [("Unknown", "2026-10-09"), (" ", ""), ("Invented", "Tomorrow")]
)
def test_unverified_optional_metadata_becomes_null(source, provider, owner, due_date):
    provider["body"]["action_items"][0].update(owner=owner, due_date=due_date)
    result = ai.generate({}, source)
    assert result.action_items[0].owner is None
    assert result.action_items[0].due_date is None
    assert result.action_items[0].source_segment_ids == [source[0]["id"]]
    assert provider["calls"] == 1


def test_explicit_metadata_and_relative_deadline_are_preserved(source, provider):
    result = ai.generate({}, source)
    assert result.action_items[0].owner == "Alex"
    assert result.action_items[0].due_date == "next Friday"


def test_metadata_must_come_from_the_actions_cited_segments(source, provider):
    other = {"id": str(uuid4()), "text": "Someone discussed another task."}
    provider["body"]["action_items"][0]["source_segment_ids"] = [other["id"]]
    result = ai.generate({}, [*source, other])
    assert result.action_items[0].owner is None and result.action_items[0].due_date is None


@pytest.mark.parametrize(
    "fault,reason",
    [
        ("unknown_id", EvidenceReason.UNKNOWN_SEGMENT),
        ("missing_sources", EvidenceReason.INVALID_ITEM),
        ("malformed", EvidenceReason.SCHEMA_MISMATCH),
        ("truncated", EvidenceReason.OUTPUT_TRUNCATED),
    ],
)
def test_invalid_evidence_is_still_rejected_without_retry(source, provider, fault, reason):
    if fault == "unknown_id":
        provider["body"]["overview"]["source_segment_ids"] = [str(uuid4())]
    elif fault == "missing_sources":
        provider["body"]["overview"]["source_segment_ids"] = []
    elif fault == "malformed":
        provider["body"] = "private model output, not JSON"
    else:
        provider["finish"] = "length"
    with pytest.raises(EvidenceValidationError) as exc:
        ai.generate({}, source)
    assert exc.value.reason == reason
    assert provider["calls"] == 1


@pytest.fixture
def summary_api(monkeypatch, source, provider):
    monkeypatch.setenv("GROQ_API_KEY", "fixture-only-key")
    settings.cache_clear()
    output = io.StringIO()
    monkeypatch.setattr(processing_logging.handler, "stream", output)

    @contextmanager
    def connection():
        yield None

    monkeypatch.setattr(db, "connection", connection)
    monkeypatch.setattr(
        evidence_service.meeting_service, "require_owned", lambda *a: {"summary_state": "pending"}
    )
    monkeypatch.setattr(evidence_service.evidence_repository, "list_segments", lambda *a: source)
    monkeypatch.setattr(evidence_service.jobs, "claim", Mock(return_value=uuid4()))
    monkeypatch.setattr(evidence_service.jobs, "finish", Mock())
    monkeypatch.setattr(evidence_service.jobs, "fail_job", Mock())
    save = Mock()
    monkeypatch.setattr(evidence_service.evidence_repository, "insert_summary", save)
    monkeypatch.setattr(evidence_service.evidence_repository, "insert_action", Mock())
    app.dependency_overrides[current_user] = lambda: uuid4()
    try:
        with TestClient(app) as client:
            yield client, output, save
    finally:
        app.dependency_overrides.pop(current_user, None)
        settings.cache_clear()


def test_http_summary_persists_with_unknown_metadata_null(summary_api, provider):
    client, _, save = summary_api
    provider["body"]["action_items"][0]["owner"] = "Unassigned"
    response = client.post(f"/meetings/{uuid4()}/summarize")
    assert response.status_code == 200
    assert save.call_args.kwargs["summary"].action_items[0].owner is None


def test_failure_logs_only_reason_and_keeps_http_sanitized(summary_api, provider):
    client, output, save = summary_api
    provider["body"] = "PRIVATE-TRANSCRIPT https://private.invalid?token=PRIVATE-KEY"
    response = client.post(f"/meetings/{uuid4()}/summarize")
    assert response.status_code == 502
    assert response.json()["detail"] == {
        "code": "invalid_evidence",
        "message": "AI output failed evidence validation. Saved earlier stages are preserved.",
        "retryable": True,
    }
    assert "stage=summary_generation reason=schema_mismatch" in output.getvalue()
    assert "Traceback" not in output.getvalue()
    assert "PRIVATE" not in output.getvalue() + response.text
    assert provider["calls"] == 1
    save.assert_not_called()


@pytest.mark.parametrize("code,status", [("free_plan_unverified", 503), ("quota_exhausted", 429)])
def test_budget_gates_still_prevent_provider_calls(
    summary_api, provider, monkeypatch, code, status
):
    client, _, save = summary_api
    monkeypatch.setattr(
        evidence_service.jobs, "claim", Mock(side_effect=AppError(status, code, "Fixture"))
    )
    response = client.post(f"/meetings/{uuid4()}/summarize")
    assert response.status_code == status and response.json()["detail"]["code"] == code
    assert provider["calls"] == 0
    save.assert_not_called()


def test_provider_quota_is_not_retried(summary_api, provider):
    client, output, _ = summary_api
    provider["error"] = groq.RateLimitError(
        "Fixture",
        response=httpx.Response(429, request=httpx.Request("POST", "https://fixture.invalid")),
        body=None,
    )
    response = client.post(f"/meetings/{uuid4()}/summarize")
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "provider_quota"
    assert provider["calls"] == 1 and not output.getvalue()
