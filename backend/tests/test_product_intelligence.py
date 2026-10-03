from uuid import uuid4

from app import db
from app.evidence_schemas import Answer, validate_evidence


def seed(client, headers):
    response = client.post("/demo-seed", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_demo_seed_is_persistent_idempotent_and_owner_scoped(client, token):
    alice, bob = token(), token("auth0|bob")
    rows = seed(client, alice)
    assert len(rows) == 4
    assert [r["id"] for r in seed(client, alice)] == [r["id"] for r in rows]
    assert len(client.get("/meetings", headers=alice).json()) == 4
    assert client.get("/meetings", headers=bob).json() == []
    assert all(not row["recording_ready"] for row in rows)
    assert all(row["demo_seed_key"] for row in rows)
    evidence = client.get(f"/meetings/{rows[0]['id']}/evidence", headers=alice).json()
    assert len(evidence["segments"]) == 6
    ids = {s["id"] for s in evidence["segments"]}
    for question in evidence["questions"]:
        assert set(question["answer"]["source_segment_ids"]) <= ids
        validate_evidence(Answer(**question["answer"]), evidence["segments"])
    assert evidence["highlights"][0]["segment_id"] in ids
    assert client.get(f"/meetings/{rows[0]['id']}/evidence", headers=bob).status_code == 404
    assert client.get(f"/meetings/{rows[0]['id']}/playback", headers=alice).status_code == 409


def test_highlights_cannot_cross_meetings_and_survive_reload(client, token):
    alice, bob = token(), token("auth0|bob")
    rows = seed(client, alice)
    first, second = rows[0]["id"], rows[1]["id"]
    evidence = client.get(f"/meetings/{first}/evidence", headers=alice).json()
    segment = evidence["segments"][0]
    body = {"segment_id": segment["id"]}
    assert client.post(f"/meetings/{first}/highlights", headers=bob, json=body).status_code == 404
    assert (
        client.post(f"/meetings/{second}/highlights", headers=alice, json=body).status_code == 404
    )
    response = client.post(f"/meetings/{first}/highlights", headers=alice, json=body)
    assert response.status_code == 201
    highlight_id = response.json()["id"]
    assert (
        client.post(f"/meetings/{first}/highlights", headers=alice, json=body).json()["id"]
        == highlight_id
    )
    fresh = client.get(f"/meetings/{first}/evidence", headers=alice).json()
    highlight = next(h for h in fresh["highlights"] if h["id"] == highlight_id)
    assert highlight["text"] == segment["text"]
    assert highlight["start_seconds"] == segment["start_seconds"]
    assert (
        client.delete(f"/meetings/{first}/highlights/{highlight_id}", headers=bob).status_code
        == 404
    )
    assert (
        client.delete(f"/meetings/{second}/highlights/{highlight_id}", headers=alice).status_code
        == 404
    )
    assert (
        client.delete(f"/meetings/{first}/highlights/{highlight_id}", headers=alice).status_code
        == 204
    )
    assert all(
        h["id"] != highlight_id
        for h in client.get(f"/meetings/{first}/evidence", headers=alice).json()["highlights"]
    )


def test_search_groups_evidence_and_never_leaks_other_owner_or_media(client, token):
    alice, bob = token(), token("auth0|bob")
    rows = seed(client, alice)
    for query, kind in [
        ("roadmap", "title"),
        ("Customer interviews", "transcript"),
        ("focused first release", "summary"),
        ("defer calendar", "decision"),
        ("Review onboarding copy", "action"),
    ]:
        result = client.get("/search", headers=alice, params={"q": query})
        assert result.status_code == 200, result.text
        hits = result.json()
        assert any(h["kind"] == kind for h in hits), (query, hits)
        assert all(h["meeting_id"] in {r["id"] for r in rows} for h in hits)
        assert "recording_key" not in result.text
        assert "recording_url" not in result.text
        assert client.get("/search", headers=bob, params={"q": query}).json() == []
        for hit in hits:
            if hit["segment_id"]:
                evidence = client.get(
                    f"/meetings/{hit['meeting_id']}/evidence", headers=alice
                ).json()
                source = next(s for s in evidence["segments"] if s["id"] == hit["segment_id"])
                assert source["start_seconds"] == hit["start_seconds"]
    assert client.get("/search", headers=alice, params={"q": "%' OR 1=1 --"}).json() == []
    assert client.get("/search", headers=alice, params={"q": "a"}).status_code == 422
    assert client.get("/search", params={"q": "roadmap"}).status_code == 401
    with db.connection() as conn:
        conn.execute("update app.meetings set deleted_at=now() where id=%s", (rows[0]["id"],))
    assert not client.get("/search", headers=alice, params={"q": "roadmap"}).json()


def test_action_changes_preserve_evidence_and_reject_foreign_owner(client, token):
    alice, bob = token(), token("auth0|bob")
    meeting = seed(client, alice)[0]["id"]
    evidence = client.get(f"/meetings/{meeting}/evidence", headers=alice).json()
    action = evidence["actions"][0]
    body = {
        "text": "Review the final consent copy",
        "owner": "Manual owner",
        "due_date": "Monday",
        "completed": True,
    }
    path = f"/meetings/{meeting}/actions/{action['id']}"
    assert client.patch(path, headers=bob, json=body).status_code == 404
    assert (
        client.patch(
            path, headers=alice, json={**body, "source_segment_ids": [str(uuid4())]}
        ).status_code
        == 422
    )
    assert client.patch(path, headers=alice, json=body).status_code == 200
    fresh = client.get(f"/meetings/{meeting}/evidence", headers=alice).json()
    saved = next(a for a in fresh["actions"] if a["id"] == action["id"])
    assert all(saved[key] == value for key, value in body.items())
    assert saved["source_segment_ids"] == action["source_segment_ids"]
    seed(client, alice)
    fresh = client.get(f"/meetings/{meeting}/evidence", headers=alice).json()
    assert next(a for a in fresh["actions"] if a["id"] == action["id"])["text"] == body["text"]


def test_sample_audio_slots_align_and_overruns_fail_closed(monkeypatch):
    import io
    import wave
    from pathlib import Path

    import pytest

    from app.services import demo_recording_service

    def speech(command, **kwargs):
        path = Path(command[command.index("-w") + 1])
        with wave.open(str(path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(8000)
            output.writeframes(b"\x01\x00" * 8000)

    monkeypatch.setattr(demo_recording_service.subprocess, "run", speech)
    segments = [
        dict(text="Scripted sample", start_seconds=i * 20, end_seconds=(i + 1) * 20)
        for i in range(2)
    ]
    content, duration = demo_recording_service.synthesize(segments, "local-speech-fixture")
    assert duration == 40
    with wave.open(io.BytesIO(content), "rb") as audio:
        assert audio.getnframes() / audio.getframerate() == 40
        audio.setpos(20 * 8000)
        assert audio.readframes(1) == b"\x01\x00"
    with pytest.raises(ValueError, match="timeline has changed"):
        demo_recording_service.synthesize([{**segments[0], "start_seconds": 1}], "fixture")

    def oversized(command, **kwargs):
        with wave.open(command[command.index("-w") + 1], "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(8000)
            output.writeframes(b"\0" * 8000 * 2 * 21)

    monkeypatch.setattr(demo_recording_service.subprocess, "run", oversized)
    with pytest.raises(ValueError, match="exceeds its evidence slot"):
        demo_recording_service.synthesize(segments, "fixture")
