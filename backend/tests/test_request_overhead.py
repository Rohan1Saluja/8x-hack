from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest

from app import db
from app.config import settings
from app.errors import AppError
from app.repositories import evidence_repository, user_repository
from app.services import evidence_service


@pytest.fixture
def configured(monkeypatch):
    db.close_pool()
    monkeypatch.setenv("DATABASE_URL", "postgresql://fixture.invalid/test")
    monkeypatch.setenv("APP_ENV", "production")
    settings.cache_clear()
    yield
    db.close_pool()
    settings.cache_clear()


def test_warm_requests_reuse_bounded_pool_and_keep_transactions(configured, monkeypatch):
    events = []
    conn = Mock()

    @contextmanager
    def transaction():
        try:
            yield conn
        except Exception:
            events.append("rollback")
            raise
        else:
            events.append("commit")

    fake_pool = Mock()
    fake_pool.connection = transaction
    factory = Mock(return_value=fake_pool)
    monkeypatch.setattr(db, "ConnectionPool", factory)
    with db.connection():
        pass
    with pytest.raises(ValueError), db.connection():
        raise ValueError("fixture")
    assert events == ["commit", "rollback"]
    assert factory.call_count == 1
    kwargs = factory.call_args.kwargs
    assert kwargs["min_size"] == 0 and kwargs["max_size"] == 4
    assert kwargs["timeout"] == 5
    assert kwargs["kwargs"]["prepare_threshold"] is None
    assert kwargs["kwargs"]["sslmode"] == "require"
    assert conn.execute.call_count == 2
    db.close_pool()
    fake_pool.close.assert_called_once()


def test_existing_user_is_read_only():
    conn = Mock()
    owner = uuid4()
    conn.execute.return_value.fetchone.return_value = {"id": owner}
    assert user_repository.resolve(conn, "fixture") == owner
    conn.execute.assert_called_once_with(
        "select id from app.users where auth0_sub=%s", ("fixture",)
    )


@pytest.mark.parametrize("concurrent", [False, True])
def test_first_login_and_concurrent_registration(concurrent):
    owner = uuid4()
    conn = Mock()
    rows = [None, None, {"id": owner}] if concurrent else [None, {"id": owner}]
    conn.execute.side_effect = [SimpleNamespace(fetchone=lambda row=row: row) for row in rows]
    assert user_repository.resolve(conn, "fixture") == owner
    assert "do nothing returning id" in conn.execute.call_args_list[1].args[0]


def test_bundle_queues_reads_before_fetch_and_preserves_shape():
    queued, fetching = [], []
    inside = False
    summary = {"overview": "fixture"}

    @contextmanager
    def pipeline():
        nonlocal inside
        inside = True
        yield
        inside = False

    def execute(query, params):
        assert inside
        queued.append(query)
        assert params == (meeting_id,)

        def fetchall():
            assert not inside and len(queued) == 6
            fetching.append(query)
            return [{"content": summary}] if query == evidence_repository.GET_SUMMARY_SQL else []

        return SimpleNamespace(fetchall=fetchall)

    meeting_id = uuid4()
    conn = SimpleNamespace(pipeline=pipeline, execute=execute)
    assert evidence_repository.read_bundle(conn, meeting_id) == {
        "segments": [],
        "summary": summary,
        "actions": [],
        "questions": [],
        "jobs": [],
        "highlights": [],
    }
    assert len(fetching) == 6


def test_bundle_is_never_read_before_ownership(monkeypatch):
    @contextmanager
    def connection():
        yield None

    def forbidden(*args):
        raise AppError(404, "meeting_not_found", "Meeting not found.")

    read = Mock()
    monkeypatch.setattr(db, "connection", connection)
    monkeypatch.setattr(evidence_service.meeting_service, "require_owned", forbidden)
    monkeypatch.setattr(evidence_repository, "read_bundle", read)
    with pytest.raises(AppError):
        evidence_service.get_evidence(uuid4(), uuid4())
    read.assert_not_called()
