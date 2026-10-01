import time
from uuid import uuid4

import jwt
import psycopg
import pytest

from app.integrations import storage


def create(client, token):
    return client.post(
        "/meetings",
        headers=token(),
        json={
            "title": "Planning",
            "meeting_url": "https://meet.google.com/abc-defg-hij",
            "request_id": str(uuid4()),
        },
    )


def test_auth_health_and_me(client, token):
    assert client.get("/health").status_code == 200
    assert client.get("/me").status_code == 401
    response = client.get("/me", headers=token())
    assert response.status_code == 200
    assert response.json()["id"] == client.get("/me", headers=token()).json()["id"]


@pytest.mark.parametrize(
    "claims",
    [{"exp": int(time.time()) - 60}, {"aud": "wrong"}, {"iss": "https://evil.test/"}, {"sub": ""}],
)
def test_invalid_claims(client, token, claims):
    assert client.get("/me", headers=token(**claims)).status_code == 401


def test_algorithm_and_invalid_signature(client, token):
    forged = jwt.encode(
        {"sub": "auth0|alice"}, "fixture-key-that-is-at-least-32-bytes", algorithm="HS256"
    )
    assert client.get("/me", headers={"Authorization": "Bearer " + forged}).status_code == 401
    headers = token()
    raw = headers["Authorization"].split()[1]
    parts = raw.split(".")
    parts[-1] = ("A" if parts[-1][0] != "A" else "B") + parts[-1][1:]
    assert (
        client.get("/me", headers={"Authorization": "Bearer " + ".".join(parts)}).status_code == 401
    )


def test_two_users_and_persistence(client, token, monkeypatch):
    response = create(client, token)
    assert response.status_code == 201
    meeting_id = response.json()["id"]
    assert "owner_id" not in response.json() and "recording_key" not in response.json()
    assert len(client.get("/meetings", headers=token()).json()) == 1
    assert client.get("/meetings", headers=token("auth0|bob")).json() == []
    monkeypatch.setattr(
        storage, "playback_url", lambda _: pytest.fail("Must check ownership before storage")
    )
    for method, path in [("GET", ""), ("GET", "/playback"), ("DELETE", "")]:
        assert (
            client.request(
                method, f"/meetings/{meeting_id}{path}", headers=token("auth0|bob")
            ).status_code
            == 404
        )
    assert client.get(f"/meetings/{meeting_id}", headers=token()).json()["title"] == "Planning"


def test_create_idempotency_and_validation(client, token):
    body = {
        "title": "Planning",
        "meeting_url": "https://meet.google.com/abc-defg-hij",
        "request_id": str(uuid4()),
    }
    first = client.post("/meetings", headers=token(), json=body)
    second = client.post("/meetings", headers=token(), json=body)
    assert first.json()["id"] == second.json()["id"]
    assert (
        client.post("/meetings", headers=token(), json={**body, "title": "Different"}).status_code
        == 409
    )
    assert (
        client.post(
            "/meetings", headers=token(), json={**body, "owner_id": str(uuid4())}
        ).status_code
        == 422
    )
    for url in [
        "https://evil.test/abc-defg-hij",
        "https://meet.google.com@evil.test/abc-defg-hij",
        "http://meet.google.com/abc-defg-hij",
    ]:
        assert (
            client.post("/meetings", headers=token(), json={**body, "meeting_url": url}).status_code
            == 422
        )


def test_private_schema_and_bucket(postgres):
    with psycopg.connect(postgres) as conn:
        assert conn.execute(
            "select public from storage.buckets where id='recordings'"
        ).fetchone() == (False,)
        assert conn.execute("select has_schema_privilege('anon','app','USAGE')").fetchone() == (
            False,
        )
        assert conn.execute(
            "select has_table_privilege('authenticated','app.meetings','SELECT')"
        ).fetchone() == (False,)
