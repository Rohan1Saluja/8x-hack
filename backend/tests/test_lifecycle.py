from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import psycopg
import pytest


def create(client, token):
    body = {"title": "Product review", "demo": True, "request_id": str(uuid4())}
    first = client.post("/meetings", headers=token(), json=body)
    assert first.status_code == 201
    assert client.post("/meetings", headers=token(), json=body).json()["id"] == first.json()["id"]
    return first.json()


def action(client, headers, meeting, name, **body):
    return client.post(
        f"/meetings/{meeting['id']}/{name}",
        headers=headers,
        json={"expected_version": meeting["lifecycle_version"], **body},
    )


def age(postgres, meeting):
    with psycopg.connect(postgres) as conn:
        conn.execute(
            "update app.meetings set lifecycle_updated_at=now()-interval '3 seconds' where id=%s",
            (meeting["id"],),
        )


def test_full_persisted_demo_without_fabricated_evidence(client, token, postgres):
    m = create(client, token)
    headers = token()
    assert m["meeting_url"] is None
    assert action(client, headers, m, "send").status_code == 422
    m = action(client, headers, m, "send", consent=True).json()
    assert m["lifecycle_state"] == "joining"
    assert m["consent_confirmed_at"] and m["capture_mode"] == "demo"
    assert action(client, headers, m, "admit").status_code == 409
    assert action(client, headers, m, "advance").json()["lifecycle_state"] == "joining"
    age(postgres, m)
    m = action(client, headers, m, "advance").json()
    assert m["lifecycle_state"] == "awaiting_admission"
    age(postgres, m)
    assert action(client, headers, m, "advance").json()["lifecycle_state"] == "awaiting_admission"
    for name, state in [
        ("admit", "recording"),
        ("stop", "transcribing"),
        ("advance", "summarizing"),
        ("advance", "ready"),
    ]:
        previous = m
        age(postgres, m)
        response = action(client, headers, m, name)
        assert response.status_code == 200
        m = response.json()
        assert m["lifecycle_state"] == state
        # New HTTP reads and list refreshes reconstruct state from PostgreSQL.
        assert client.get(f"/meetings/{m['id']}", headers=headers).json() == m
        assert client.get("/meetings", headers=headers).json()[0] == m
        assert action(client, headers, previous, name).json() == m
    assert not m["recording_ready"] and m["duration_seconds"] is None
    assert m["transcription_state"] == m["summary_state"] == "pending"
    evidence = client.get(f"/meetings/{m['id']}/evidence", headers=headers).json()
    assert evidence == {
        "segments": [],
        "summary": None,
        "actions": [],
        "questions": [],
        "jobs": [],
        "highlights": [],
    }
    assert client.get(f"/meetings/{m['id']}/playback", headers=headers).status_code == 409
    with psycopg.connect(postgres) as conn:
        assert conn.execute("select count(*) from app.processing_jobs").fetchone() == (0,)
        assert conn.execute("select count(*) from app.provider_budget").fetchone() == (0,)


def test_concurrent_replays_and_cancel_retry(client, token, postgres):
    m = create(client, token)
    headers = token()
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(
            pool.map(lambda _: action(client, headers, m, "send", consent=True), range(6))
        )
    assert all(r.status_code == 200 for r in results)
    assert all(r.json()["lifecycle_version"] == 1 for r in results)
    m = results[0].json()
    assert client.delete(f"/meetings/{m['id']}", headers=headers).status_code == 409
    failed = action(client, headers, m, "stop").json()
    assert failed["lifecycle_state"] == "failed"
    assert failed["failure_code"] == "demo_cancelled"
    retry = action(client, headers, failed, "retry-capture", consent=True).json()
    assert retry["lifecycle_state"] == "joining" and retry["failure_code"] is None
    assert action(client, headers, failed, "retry-capture", consent=True).json() == retry
    assert action(client, headers, m, "stop").json() == retry


@pytest.mark.parametrize("name", ["send", "advance", "admit", "stop", "retry-capture"])
def test_lifecycle_identity_and_ownership(client, token, name):
    m = create(client, token)
    assert action(client, {}, m, name, consent=True).status_code == 401
    assert action(client, token("auth0|bob"), m, name, consent=True).status_code == 404
    assert action(client, token(), m, name, owner_id=str(uuid4())).status_code == 422
    assert client.get(f"/meetings/{m['id']}", headers=token()).json()["lifecycle_version"] == 0


def test_demo_creation_requires_explicit_choice(client, token):
    body = {"title": "No link", "request_id": str(uuid4())}
    assert client.post("/meetings", headers=token(), json=body).status_code == 422
