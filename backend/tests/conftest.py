import os
import time
from pathlib import Path
from types import SimpleNamespace

import jwt
import pgserver
import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.config import settings
from app.main import app


@pytest.fixture(scope="session")
def postgres(tmp_path_factory):
    uri = os.getenv("TEST_DATABASE_URL")
    server = None
    if not uri:
        server = pgserver.get_server(tmp_path_factory.mktemp("pgdata"), cleanup_mode="delete")
        uri = server.get_uri()
    with psycopg.connect(uri, autocommit=True) as conn:
        conn.execute("create role anon; create role authenticated; create schema storage")
        # Minimal Supabase bucket metadata fixture; actual Storage HTTP API remains unverified.
        conn.execute(
            "create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[])"
        )
        for migration in sorted((Path(__file__).parents[2] / "supabase/migrations").glob("*.sql")):
            conn.execute(migration.read_text())
    yield uri
    if server:
        server.cleanup()


@pytest.fixture
def client(postgres, monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", postgres)
    monkeypatch.setenv("AUTH0_DOMAIN", "unit-test.auth0.com")
    monkeypatch.setenv("AUTH0_AUDIENCE", "https://eightx.test/api")
    settings.cache_clear()
    with psycopg.connect(postgres, autocommit=True) as conn:
        conn.execute("truncate app.users cascade")
        conn.execute("truncate app.provider_budget")
    with TestClient(app) as test_client:
        yield test_client
    settings.cache_clear()


@pytest.fixture
def token(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    fake_jwks = SimpleNamespace(
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())
    )
    monkeypatch.setattr(auth, "jwks_client", lambda _: fake_jwks)

    def create(sub="auth0|alice", **overrides):
        claims = {
            "sub": sub,
            "iss": "https://unit-test.auth0.com/",
            "aud": "https://eightx.test/api",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
            **overrides,
        }
        return {"Authorization": "Bearer " + jwt.encode(claims, key, algorithm="RS256")}

    return create
